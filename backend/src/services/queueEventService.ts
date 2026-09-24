import { Response } from 'express';
import { QueueEvents } from 'bullmq';
import { EMAIL_QUEUE_NAME } from '../queues/emailQueue';
import { redisOptions } from '../config/redis';

// Set of connected SSE client response streams
const sseClients = new Set<Response>();

// Initialize BullMQ QueueEvents listener reusing existing Redis connection options
export const queueEvents = new QueueEvents(EMAIL_QUEUE_NAME, {
  connection: redisOptions,
});

// Broadcast event payload to all connected SSE client streams
function broadcastQueueEvent(type: string, jobId: string) {
  if (sseClients.size === 0) return;

  const payload = `event: queue-update\ndata: ${JSON.stringify({ type, jobId, timestamp: Date.now() })}\n\n`;

  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (err) {
      console.error('Error writing to SSE client, removing client:', err);
      sseClients.delete(client);
    }
  }
}

// Register QueueEvents listeners
queueEvents.on('waiting', ({ jobId }) => broadcastQueueEvent('waiting', String(jobId)));
queueEvents.on('active', ({ jobId }) => broadcastQueueEvent('active', String(jobId)));
queueEvents.on('completed', ({ jobId }) => broadcastQueueEvent('completed', String(jobId)));
queueEvents.on('failed', ({ jobId }) => broadcastQueueEvent('failed', String(jobId)));
queueEvents.on('delayed', ({ jobId }) => broadcastQueueEvent('delayed', String(jobId)));

export function registerSseClient(res: Response): void {
  sseClients.add(res);
  console.log(`SSE client connected to queue events (Total active SSE clients: ${sseClients.size})`);
}

export function unregisterSseClient(res: Response): void {
  sseClients.delete(res);
  console.log(`SSE client disconnected (Total active SSE clients: ${sseClients.size})`);
}
