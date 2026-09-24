import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
const isRemoteUrl = Boolean(
  databaseUrl && !databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1')
);
const sslConfig =
  process.env.DB_SSL === 'true' ||
  process.env.DB_SSL === '1' ||
  process.env.PGSSLMODE === 'require' ||
  isRemoteUrl
    ? { rejectUnauthorized: false }
    : undefined;

const poolConfig: PoolConfig = databaseUrl
  ? {
      connectionString: databaseUrl,
      ssl: sslConfig,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    }
  : {
      host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.PGPORT || process.env.DB_PORT || '5432', 10),
      user: process.env.PGUSER || process.env.DB_USER || 'postgres',
      password: process.env.PGPASSWORD || process.env.DB_PASSWORD || '',
      database: process.env.PGDATABASE || process.env.DB_NAME || 'email_scheduler',
      ssl: sslConfig,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.warn('[PostgreSQL Connection Warning]', err?.message || err);
});

export default pool;
