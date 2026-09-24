import Redis from 'ioredis';
import { ConnectionOptions } from 'bullmq';
import dotenv from 'dotenv';

dotenv.config();

export const redisOptions: ConnectionOptions = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null,
};

export const redisClient = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null,
  lazyConnect: true,
});
