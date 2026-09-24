import { Client } from '@elastic/elasticsearch';
import dotenv from 'dotenv';

dotenv.config();

export const ELASTICSEARCH_NODE = process.env.ELASTICSEARCH_NODE || 'http://localhost:9200';
export const ELASTICSEARCH_INDEX = process.env.ELASTICSEARCH_INDEX || 'emails';

export const esClient = new Client({
  node: ELASTICSEARCH_NODE,
  // requestTimeout short so network hangs don't delay Express endpoints if ES is down
  requestTimeout: 3000,
  maxRetries: 1,
});
