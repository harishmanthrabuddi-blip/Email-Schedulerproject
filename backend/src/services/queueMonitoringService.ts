import { Job } from 'bullmq';
import { emailQueue, EMAIL_QUEUE_NAME } from '../queues/emailQueue';
import { redisClient } from '../config/redis';
import * as emailRepository from '../repositories/emailRepository';

export interface SafeJobData {
  id: string;
  name: string;
  status: string;
  data: {
    emailId: number;
    recipient?: string;
  };
  attemptsMade: number;
  delay: number;
  timestamp: number;
  processedOn: number | null;
  finishedOn: number | null;
  failedReason: string | null;
}

export async function getGlobalQueueStats() {
  const counts = await emailQueue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed');
  return {
    queueName: EMAIL_QUEUE_NAME,
    counts: {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      delayed: counts.delayed || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
    },
  };
}

export async function getUserJobStats(userId: number) {
  const userEmails = await emailRepository.getAllEmailsByUserId(userId);
  const counts = {
    scheduled: 0,
    processing: 0,
    sent: 0,
    failed: 0,
  };

  for (const email of userEmails) {
    if (email.status === 'scheduled') counts.scheduled++;
    else if (email.status === 'processing') counts.processing++;
    else if (email.status === 'sent') counts.sent++;
    else if (email.status === 'failed') counts.failed++;
  }

  return counts;
}

export async function getUserJobs(
  userId: number,
  status: string = 'delayed',
  page: number = 1,
  limit: number = 20
) {
  const allowedStatuses = ['waiting', 'active', 'delayed', 'completed', 'failed'];
  const targetStatus = allowedStatuses.includes(status) ? (status as any) : 'delayed';

  const currentPage = Math.max(1, page);
  const currentLimit = Math.min(100, Math.max(1, limit));

  // Get user emails mapping for ownership verification
  const userEmails = await emailRepository.getAllEmailsByUserId(userId);
  const userEmailMap = new Map(userEmails.map((e) => [e.id, e]));

  // Query jobs from BullMQ queue
  const jobs: Job[] = await emailQueue.getJobs([targetStatus], 0, 1000, true);

  // Filter jobs belonging to current authenticated user
  const userJobs: SafeJobData[] = [];
  for (const job of jobs) {
    const emailId = job?.data?.emailId;
    if (emailId && userEmailMap.has(emailId)) {
      const emailRecord = userEmailMap.get(emailId);
      userJobs.push({
        id: String(job.id),
        name: job.name,
        status: targetStatus,
        data: {
          emailId: job.data.emailId,
          recipient: emailRecord?.recipient || job.data.recipient,
        },
        attemptsMade: job.attemptsMade || 0,
        delay: job.delay || 0,
        timestamp: job.timestamp,
        processedOn: job.processedOn || null,
        finishedOn: job.finishedOn || null,
        failedReason: job.failedReason || null,
      });
    }
  }

  // Calculate pagination slice
  const total = userJobs.length;
  const totalPages = Math.ceil(total / currentLimit) || 1;
  const startIndex = (currentPage - 1) * currentLimit;
  const paginatedJobs = userJobs.slice(startIndex, startIndex + currentLimit);

  return {
    jobs: paginatedJobs,
    page: currentPage,
    limit: currentLimit,
    total,
    totalPages,
  };
}

export async function getUserJobDetails(userId: number, jobId: string): Promise<SafeJobData | null> {
  const job = await emailQueue.getJob(jobId);
  if (!job) {
    return null;
  }

  const emailId = job.data?.emailId;
  if (!emailId) {
    return null;
  }

  // Verify email ownership in MySQL
  const emailRecord = await emailRepository.findEmailById(emailId);
  if (!emailRecord || emailRecord.user_id !== userId) {
    // Return null (404) if job belongs to another user
    return null;
  }

  // Determine actual job state
  const state = await job.getState();

  return {
    id: String(job.id),
    name: job.name,
    status: state,
    data: {
      emailId: job.data.emailId,
      recipient: emailRecord.recipient,
    },
    attemptsMade: job.attemptsMade || 0,
    delay: job.delay || 0,
    timestamp: job.timestamp,
    processedOn: job.processedOn || null,
    finishedOn: job.finishedOn || null,
    failedReason: job.failedReason || null,
  };
}

export async function getQueueHealth() {
  let redisStatus = 'disconnected';
  try {
    const ping = await redisClient.ping();
    if (ping === 'PONG') {
      redisStatus = 'connected';
    }
  } catch (e) {
    redisStatus = 'error';
  }

  const rawConcurrency = process.env.WORKER_CONCURRENCY;
  const parsedConcurrency = parseInt(rawConcurrency || '5', 10);
  const workerConcurrency = isNaN(parsedConcurrency) || parsedConcurrency < 1 ? 5 : parsedConcurrency;

  return {
    redis: redisStatus,
    queue: 'healthy',
    queueName: EMAIL_QUEUE_NAME,
    workerConcurrency,
    workerStatus: 'Running',
  };
}
