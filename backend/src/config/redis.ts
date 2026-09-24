import Redis from 'ioredis';
import { ConnectionOptions } from 'bullmq';
import dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_URL;
const redisPassword = process.env.REDIS_PASSWORD || undefined;
const useTls = process.env.REDIS_TLS === 'true' || process.env.REDIS_TLS === '1';

export const redisOptions: ConnectionOptions = redisUrl
  ? {
      url: redisUrl,
      maxRetriesPerRequest: null,
    }
  : {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: redisPassword,
      tls: useTls ? { rejectUnauthorized: false } : undefined,
      maxRetriesPerRequest: null,
    };

export const redisClient = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    })
  : new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: redisPassword,
      tls: useTls ? { rejectUnauthorized: false } : undefined,
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });

redisClient.on('error', (err) => {
  console.warn('[Redis Connection Warning]', err?.message || err);
});
