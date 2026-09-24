import dotenv from 'dotenv';
import { redisClient } from '../config/redis';

dotenv.config();

export interface RateLimitReservationResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  remaining: number;
  windowStart: Date;
  nextWindowStart: Date;
}

export interface RateLimitStatus {
  limit: number;
  currentCount: number;
  remaining: number;
  window: string;
  nextWindow: string;
}

export function getLimitConfig(): number {
  const raw = process.env.EMAILS_PER_HOUR;
  const parsed = parseInt(raw || '10', 10);
  return isNaN(parsed) || parsed < 1 ? 10 : parsed;
}

export function getRateLimitKey(date: Date = new Date()): {
  key: string;
  windowStart: Date;
  nextWindowStart: Date;
} {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');

  const key = `email-rate-limit:${year}-${month}-${day}-${hour}`;

  const windowStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), 0, 0, 0)
  );
  const nextWindowStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours() + 1, 0, 0, 0)
  );

  return { key, windowStart, nextWindowStart };
}

// Atomic Lua script for rate limit reservation
const luaReservationScript = `
  local current = redis.call('GET', KEYS[1])
  local limit = tonumber(ARGV[1])
  local ttl = tonumber(ARGV[2])

  if current and tonumber(current) >= limit then
      return {0, tonumber(current)}
  else
      local count = redis.call('INCR', KEYS[1])
      if count == 1 then
          redis.call('EXPIRE', KEYS[1], ttl)
      end
      return {1, count}
  end
`;

export async function reserveSlot(date: Date = new Date()): Promise<RateLimitReservationResult> {
  const limit = getLimitConfig();
  const { key, windowStart, nextWindowStart } = getRateLimitKey(date);
  const ttlSeconds = 7200; // 2 hours window TTL

  const evalResult = (await redisClient.eval(
    luaReservationScript,
    1,
    key,
    limit.toString(),
    ttlSeconds.toString()
  )) as [number, number];

  const allowed = evalResult[0] === 1;
  const currentCount = evalResult[1];
  const remaining = Math.max(0, limit - currentCount);

  return {
    allowed,
    currentCount,
    limit,
    remaining,
    windowStart,
    nextWindowStart,
  };
}

export async function releaseSlot(date: Date = new Date()): Promise<void> {
  try {
    const { key } = getRateLimitKey(date);
    const current = await redisClient.get(key);
    if (current && parseInt(current, 10) > 0) {
      await redisClient.decr(key);
    }
  } catch (error) {
    console.error('Failed to release rate limit slot:', error);
  }
}

export async function getRateLimitStatus(date: Date = new Date()): Promise<RateLimitStatus> {
  const limit = getLimitConfig();
  const { key, windowStart, nextWindowStart } = getRateLimitKey(date);

  const currentRaw = await redisClient.get(key);
  const currentCount = currentRaw ? parseInt(currentRaw, 10) : 0;
  const remaining = Math.max(0, limit - currentCount);

  return {
    limit,
    currentCount,
    remaining,
    window: windowStart.toISOString(),
    nextWindow: nextWindowStart.toISOString(),
  };
}
