import dotenv from 'dotenv';
import { redisClient } from '../config/redis';

dotenv.config();

export interface DelaySlotReservation {
  reservedTime: number;
  now: number;
  delayMs: number;
  isImmediate: boolean;
  minDelayMs: number;
}

export interface SendDelayStatus {
  minimumDelayMs: number;
  nextAvailableSendTime: string;
  now: string;
  waiting: boolean;
}

const SEND_DELAY_KEY = 'email-send-delay:next';

export function getMinDelayConfig(): number {
  const raw = process.env.MIN_SEND_DELAY_MS;
  const parsed = parseInt(raw || '2000', 10);
  return isNaN(parsed) || parsed < 0 ? 2000 : parsed;
}

// Atomic Lua script to reserve global send timestamp slot
const luaDelayReservationScript = `
  local key = KEYS[1]
  local now = tonumber(ARGV[1])
  local delay = tonumber(ARGV[2])
  local ttl = tonumber(ARGV[3])

  local currentNext = redis.call('GET', key)
  local reservedTime = now

  if currentNext then
      local currentNextNum = tonumber(currentNext)
      if currentNextNum > now then
          reservedTime = currentNextNum
      end
  end

  local newNext = reservedTime + delay
  redis.call('SET', key, newNext, 'EX', ttl)

  return tostring(reservedTime)
`;

export async function reserveDelaySlot(
  nowMs: number = Date.now()
): Promise<DelaySlotReservation> {
  const minDelayMs = getMinDelayConfig();

  if (minDelayMs === 0) {
    return {
      reservedTime: nowMs,
      now: nowMs,
      delayMs: 0,
      isImmediate: true,
      minDelayMs: 0,
    };
  }

  const ttlSeconds = 86400; // 24 hours TTL

  const reservedTimeStr = (await redisClient.eval(
    luaDelayReservationScript,
    1,
    SEND_DELAY_KEY,
    nowMs.toString(),
    minDelayMs.toString(),
    ttlSeconds.toString()
  )) as string;

  const reservedTime = parseInt(reservedTimeStr, 10);
  const delayMs = Math.max(0, reservedTime - nowMs);
  const isImmediate = delayMs === 0;

  return {
    reservedTime,
    now: nowMs,
    delayMs,
    isImmediate,
    minDelayMs,
  };
}

export async function getSendDelayStatus(
  nowMs: number = Date.now()
): Promise<SendDelayStatus> {
  const minimumDelayMs = getMinDelayConfig();
  const currentNextStr = await redisClient.get(SEND_DELAY_KEY);
  const currentNextNum = currentNextStr ? parseInt(currentNextStr, 10) : nowMs;

  const waiting = currentNextNum > nowMs;

  return {
    minimumDelayMs,
    nextAvailableSendTime: new Date(currentNextNum).toISOString(),
    now: new Date(nowMs).toISOString(),
    waiting,
  };
}
