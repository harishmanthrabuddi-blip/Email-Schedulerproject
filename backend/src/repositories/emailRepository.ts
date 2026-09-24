import pool from '../config/database';
import { CreateEmailInput, EmailRecord, EmailStatus } from '../types/email';

function mapRowToEmail(row: any): EmailRecord {
  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    sender_id: row.sender_id !== null && row.sender_id !== undefined ? Number(row.sender_id) : null,
    recipient: row.recipient,
    subject: row.subject,
    body: row.body,
    scheduled_at: new Date(row.scheduled_at),
    sent_at: row.sent_at ? new Date(row.sent_at) : null,
    status: row.status as EmailStatus,
    attempts: Number(row.attempts || 0),
    idempotency_key: row.idempotency_key,
    queue_job_id: row.queue_job_id || null,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  };
}

export async function createEmail(input: CreateEmailInput): Promise<EmailRecord> {
  const query = `
    INSERT INTO emails (user_id, sender_id, recipient, subject, body, scheduled_at, idempotency_key)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;
  const values = [
    input.userId,
    input.senderId || null,
    input.recipient,
    input.subject,
    input.body,
    input.scheduledAt,
    input.idempotencyKey,
  ];

  const result = await pool.query(query, values);
  if (result.rows.length === 0) {
    throw new Error('Failed to create email record');
  }
  return mapRowToEmail(result.rows[0]);
}

export async function findEmailById(id: number): Promise<EmailRecord | null> {
  const query = `SELECT * FROM emails WHERE id = $1`;
  const result = await pool.query(query, [id]);
  if (result.rows.length === 0) {
    return null;
  }
  return mapRowToEmail(result.rows[0]);
}

export async function findEmailByIdempotencyKey(key: string): Promise<EmailRecord | null> {
  const query = `SELECT * FROM emails WHERE idempotency_key = $1`;
  const result = await pool.query(query, [key]);
  if (result.rows.length === 0) {
    return null;
  }
  return mapRowToEmail(result.rows[0]);
}

export async function updateQueueJobId(id: number, queueJobId: string): Promise<void> {
  const query = `UPDATE emails SET queue_job_id = $1 WHERE id = $2`;
  await pool.query(query, [queueJobId, id]);
}

export async function updateEmailStatus(id: number, status: EmailStatus): Promise<void> {
  const query = `UPDATE emails SET status = $1 WHERE id = $2`;
  await pool.query(query, [status, id]);
}

export async function markAsProcessing(id: number): Promise<void> {
  const query = `
    UPDATE emails 
    SET status = 'processing', attempts = attempts + 1 
    WHERE id = $1
  `;
  await pool.query(query, [id]);
}

export async function markAsSent(id: number): Promise<void> {
  const query = `
    UPDATE emails 
    SET status = 'sent', sent_at = NOW() 
    WHERE id = $1
  `;
  await pool.query(query, [id]);
}

export async function markAsFailed(id: number): Promise<void> {
  const query = `
    UPDATE emails 
    SET status = 'failed' 
    WHERE id = $1
  `;
  await pool.query(query, [id]);
}

export async function incrementAttempts(id: number): Promise<void> {
  const query = `UPDATE emails SET attempts = attempts + 1 WHERE id = $1`;
  await pool.query(query, [id]);
}

export async function getScheduledEmailsByUserId(userId: number): Promise<EmailRecord[]> {
  const query = `
    SELECT * FROM emails 
    WHERE user_id = $1 AND status = 'scheduled' 
    ORDER BY scheduled_at ASC
  `;
  const result = await pool.query(query, [userId]);
  return result.rows.map(mapRowToEmail);
}

export async function getAllPendingScheduledEmails(): Promise<EmailRecord[]> {
  const query = `
    SELECT * FROM emails 
    WHERE status = 'scheduled' 
    ORDER BY scheduled_at ASC
  `;
  const result = await pool.query(query);
  return result.rows.map(mapRowToEmail);
}

export async function resetInterruptedProcessingEmails(): Promise<number> {
  const query = `
    UPDATE emails 
    SET status = 'scheduled' 
    WHERE status = 'processing'
  `;
  const result = await pool.query(query);
  return result.rowCount ?? 0;
}

export async function getAllEmailsByUserId(userId: number): Promise<EmailRecord[]> {
  const query = `
    SELECT * FROM emails 
    WHERE user_id = $1 
    ORDER BY id ASC
  `;
  const result = await pool.query(query, [userId]);
  return result.rows.map(mapRowToEmail);
}

export async function deleteEmailById(id: number): Promise<void> {
  const query = `DELETE FROM emails WHERE id = $1`;
  await pool.query(query, [id]);
}
