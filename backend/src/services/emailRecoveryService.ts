import * as emailRepository from '../repositories/emailRepository';
import { emailQueue } from '../queues/emailQueue';

export async function reconcileScheduledEmails(): Promise<void> {
  console.log('[Recovery] Starting scheduled job reconciliation...');

  try {
    // Reset any emails that were left in 'processing' status due to a server crash/restart
    const resetCount = await emailRepository.resetInterruptedProcessingEmails();
    if (resetCount > 0) {
      console.log(`[Recovery] Reset ${resetCount} interrupted 'processing' emails back to 'scheduled' state`);
    }

    const pendingEmails = await emailRepository.getAllPendingScheduledEmails();
    console.log(`[Recovery] Found ${pendingEmails.length} scheduled emails in MySQL`);

    const now = Date.now();

    for (const email of pendingEmails) {
      const jobId = `email-${email.id}`;
      const scheduledTime = new Date(email.scheduled_at).getTime();

      // Check whether the corresponding BullMQ job exists in Redis
      let existingJob = null;
      try {
        existingJob = await emailQueue.getJob(jobId);
      } catch (jobFetchError) {
        // If error querying Redis job, treat as missing to recreate
        existingJob = null;
      }

      if (existingJob) {
        const state = await existingJob.getState().catch(() => 'unknown');
        if (state === 'delayed' || state === 'waiting' || state === 'active') {
          console.log(`[Recovery] Email ${email.id}: BullMQ job exists, skipping`);
          if (email.queue_job_id !== jobId) {
            await emailRepository.updateQueueJobId(email.id, jobId);
          }
          continue;
        }

        // Remove stale/failed/completed job in Redis if MySQL email is still scheduled
        try {
          await existingJob.remove();
        } catch (removeErr) {
          // Safe ignore if remove fails
        }
      }

      // Calculate delay for BullMQ delayed job
      const delay = Math.max(0, scheduledTime - now);

      if (delay === 0) {
        console.log(
          `[Recovery] Email ${email.id}: scheduled_at has passed, enqueueing immediately`
        );
      } else {
        console.log(
          `[Recovery] Email ${email.id}: BullMQ job missing, recreating delayed job`
        );
      }

      // Idempotently add/recreate delayed job in BullMQ
      await emailQueue.add(
        'send-email',
        {
          emailId: email.id,
          recipient: email.recipient,
        },
        {
          delay,
          jobId,
        }
      );

      // Update queue_job_id in MySQL
      await emailRepository.updateQueueJobId(email.id, jobId);
    }
  } catch (error: any) {
    console.error('[Recovery] Scheduled job reconciliation encountered an error:', error?.message || error);
  }

  console.log('[Recovery] Recovery completed');
}
