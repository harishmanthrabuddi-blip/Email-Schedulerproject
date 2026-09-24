import pool from '../config/database';
import { esClient, ELASTICSEARCH_INDEX } from '../config/elasticsearch';
import { EmailRecord } from '../types/email';
import { getAllEmailsByUserId } from '../repositories/emailRepository';

export interface SearchEmailsParams {
  userId: number;
  q?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface SearchEmailsResult {
  reachable: boolean;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  data: any[];
}

export async function isElasticsearchReachable(): Promise<boolean> {
  try {
    const pingResult = await esClient.ping();
    return Boolean(pingResult);
  } catch (error) {
    return false;
  }
}

export async function initializeEmailIndex(): Promise<boolean> {
  try {
    const reachable = await isElasticsearchReachable();
    if (!reachable) {
      console.warn('Elasticsearch is offline/unreachable during index initialization.');
      return false;
    }

    const exists = await esClient.indices.exists({ index: ELASTICSEARCH_INDEX });
    if (!exists) {
      await esClient.indices.create({
        index: ELASTICSEARCH_INDEX,
        mappings: {
          properties: {
            id: { type: 'long' },
            userId: { type: 'long' },
            senderId: { type: 'long' },
            recipient: { type: 'keyword' },
            subject: { type: 'text' },
            body: { type: 'text' },
            status: { type: 'keyword' },
            scheduledAt: { type: 'date' },
            sentAt: { type: 'date' },
            attempts: { type: 'integer' },
            createdAt: { type: 'date' },
            updatedAt: { type: 'date' },
          },
        },
      });
      console.log(`Created Elasticsearch index: ${ELASTICSEARCH_INDEX}`);
    }
    return true;
  } catch (error: any) {
    console.warn(`Failed to initialize Elasticsearch index: ${error?.message || error}`);
    return false;
  }
}

export function mapEmailToDoc(email: EmailRecord | any) {
  return {
    id: email.id,
    userId: email.userId ?? email.user_id ?? 1,
    senderId: email.senderId ?? email.sender_id ?? null,
    recipient: email.recipient,
    subject: email.subject,
    body: email.body,
    status: email.status,
    scheduledAt: email.scheduledAt ?? email.scheduled_at,
    sentAt: email.sentAt ?? email.sent_at ?? null,
    attempts: email.attempts ?? 0,
    createdAt: email.createdAt ?? email.created_at,
    updatedAt: email.updatedAt ?? email.updated_at,
  };
}

export async function indexEmail(email: EmailRecord | any): Promise<void> {
  try {
    const doc = mapEmailToDoc(email);
    await esClient.index({
      index: ELASTICSEARCH_INDEX,
      id: String(doc.id),
      document: doc,
    });
  } catch (error: any) {
    console.warn(`[Elasticsearch] Failed to index email #${email.id}: ${error?.message || error}`);
  }
}

export async function updateEmailStatusInIndex(
  emailId: number,
  status: string,
  sentAt?: Date | string | null
): Promise<void> {
  try {
    const docUpdate: any = {
      status,
      updatedAt: new Date(),
    };
    if (sentAt !== undefined) {
      docUpdate.sentAt = sentAt;
    }

    await esClient.update({
      index: ELASTICSEARCH_INDEX,
      id: String(emailId),
      doc: docUpdate,
    });
  } catch (error: any) {
    console.warn(`[Elasticsearch] Failed to update email status #${emailId}: ${error?.message || error}`);
  }
}

export async function searchEmailsFromDatabase(params: SearchEmailsParams): Promise<SearchEmailsResult> {
  try {
    const userIdNum = Number(params.userId);
    let query = `SELECT * FROM emails WHERE user_id = $1`;
    const queryParams: any[] = [userIdNum];
    let paramIndex = 2;

    if (params.status) {
      query += ` AND status = $${paramIndex++}`;
      queryParams.push(params.status);
    }

    if (params.q && params.q.trim().length > 0) {
      const term = `%${params.q.trim()}%`;
      query += ` AND (subject ILIKE $${paramIndex} OR recipient ILIKE $${paramIndex + 1} OR body ILIKE $${paramIndex + 2})`;
      queryParams.push(term, term, term);
      paramIndex += 3;
    }

    query += ` ORDER BY COALESCE(sent_at, scheduled_at, created_at) DESC`;

    const result = await pool.query(query, queryParams);
    const mapped = result.rows.map(mapEmailToDoc);

    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const total = mapped.length;
    const paginated = mapped.slice((page - 1) * limit, page * limit);
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      reachable: false,
      total,
      page,
      limit,
      totalPages,
      data: paginated,
    };
  } catch (dbErr) {
    console.error('PostgreSQL search fallback failed:', dbErr);
    return {
      reachable: false,
      total: 0,
      page: params.page || 1,
      limit: params.limit || 20,
      totalPages: 0,
      data: [],
    };
  }
}

export async function searchEmails(params: SearchEmailsParams): Promise<SearchEmailsResult> {
  const reachable = await isElasticsearchReachable();
  if (!reachable) {
    return searchEmailsFromDatabase(params);
  }

  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 20));
  const from = (page - 1) * limit;

  const mustClauses: any[] = [
    { term: { userId: Number(params.userId) } },
  ];

  if (params.status) {
    mustClauses.push({ term: { status: params.status } });
  }

  if (params.q && params.q.trim().length > 0) {
    mustClauses.push({
      multi_match: {
        query: params.q.trim(),
        fields: ['subject^3', 'recipient^2', 'body'],
        fuzziness: 'AUTO',
      },
    });
  }

  try {
    const searchResponse = await esClient.search({
      index: ELASTICSEARCH_INDEX,
      from,
      size: limit,
      query: {
        bool: {
          must: mustClauses,
        },
      },
      sort: [
        { scheduledAt: { order: 'desc' } },
      ],
    });

    const totalHits = typeof searchResponse.hits.total === 'number'
      ? searchResponse.hits.total
      : searchResponse.hits.total?.value || 0;

    const data = searchResponse.hits.hits.map((hit) => hit._source);
    
    // If Elasticsearch returned 0 hits, cross-verify with PostgreSQL database
    if (data.length === 0) {
      const dbResult = await searchEmailsFromDatabase(params);
      if (dbResult.total > 0) {
        return dbResult;
      }
    }

    const totalPages = Math.ceil(totalHits / limit) || 1;

    return {
      reachable: true,
      total: totalHits,
      page,
      limit,
      totalPages,
      data,
    };
  } catch (esSearchError) {
    console.warn('[Elasticsearch] Search query failed, falling back to PostgreSQL:', esSearchError);
    return searchEmailsFromDatabase(params);
  }
}

export async function reindexAllUserEmails(userId: number): Promise<{ reachable: boolean; indexedCount: number }> {
  const reachable = await isElasticsearchReachable();
  if (!reachable) {
    return { reachable: false, indexedCount: 0 };
  }

  await initializeEmailIndex();
  const emails = await getAllEmailsByUserId(userId);

  if (emails.length === 0) {
    return { reachable: true, indexedCount: 0 };
  }

  const operations = emails.flatMap((email) => [
    { index: { _index: ELASTICSEARCH_INDEX, _id: String(email.id) } },
    mapEmailToDoc(email),
  ]);

  const bulkResponse = await esClient.bulk({ operations });
  if (bulkResponse.errors) {
    console.warn('[Elasticsearch] Bulk reindex had some errors during processing.');
  }

  return { reachable: true, indexedCount: emails.length };
}
