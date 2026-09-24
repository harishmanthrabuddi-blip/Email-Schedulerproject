import { Worker, Job, DelayedError } from 'bullmq';
import dotenv from 'dotenv';
import { redisOptions } from '../config/redis';
import { EMAIL_QUEUE_NAME, EmailJobData } from '../queues/emailQueue';
import * as emailRepository from '../repositories/emailRepository';
import * as senderRepository from '../repositories/senderRepository';
import { sendEmail } from '../services/emailService';
import { reserveSlot, releaseSlot } from '../services/rateLimiter';
import { reserveDelaySlot } from '../services/sendDelayLimiter';
import { updateEmailStatusInIndex } from '../services/emailSearchService';
import { notifyRateLimitReached } from '../services/slackNotificationService';
import { reconcileScheduledEmails } from '../services/emailRecoveryService';

dotenv.config();

const rawConcurrency = process.env.WORKER_CONCURRENCY;
const parsedConcurrency = parseInt(rawConcurrency || '5', 10);
const concurrency = isNaN(parsedConcurrency) || parsedConcurrency < 1 ? 5 : parsedConcurrency;

export const emailWorker = new Worker<EmailJobData>(
  EMAIL_QUEUE_NAME,
  async (job: Job<EmailJobData>) => {
    const { emailId } = job.data;
    console.log(`[Worker] Processing email ${emailId}`);

    // 1. Fetch email record from database
    const email = await emailRepository.findEmailById(emailId);
    if (!email) {
      const errorMsg = `Email record with ID ${emailId} not found in database`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    // 2. Status safety check: only process if status is 'scheduled'
    if (email.status !== 'scheduled') {
      console.log(
        `Email ${emailId} status is '${email.status}' (not 'scheduled'). Skipping duplicate send.`
      );
      return { status: 'skipped', emailId, currentStatus: email.status };
    }

    // 3. Hourly Rate Limit Check & Slot Reservation
    const rateReservation = await reserveSlot();
    console.log(`Rate limit check: ${rateReservation.currentCount}/${rateReservation.limit} used`);

    if (!rateReservation.allowed) {
      const delayMs = rateReservation.nextWindowStart.getTime() - Date.now() + 1000;
      console.log(
        `Rate limit reached. Email ${emailId} delayed until ${rateReservation.nextWindowStart.toISOString()}`
      );

      // Trigger Slack rate limit notification safely (uses Redis deduplication & email.user_id)
      await notifyRateLimitReached(email.user_id, rateReservation.limit);

      await job.moveToDelayed(Date.now() + delayMs, job.token);
      throw new DelayedError();
    }

    // 4. Global Minimum Delay Reservation & Pre-reserved Slot Check
    const now = Date.now();
    let isDelaySatisfied = false;

    if (job.data.reservedSendTime) {
      if (now >= job.data.reservedSendTime - 100) {
        isDelaySatisfied = true;
        console.log(
          `Send slot for email ${emailId} satisfied from pre-reserved timestamp ${new Date(job.data.reservedSendTime).toISOString()}`
        );
      } else {
        const delayMs = job.data.reservedSendTime - now;
        console.log(
          `Email ${emailId} waiting for pre-reserved send time ${new Date(job.data.reservedSendTime).toISOString()} (${delayMs}ms remaining)`
        );
        await releaseSlot();
        await job.moveToDelayed(job.data.reservedSendTime, job.token);
        throw new DelayedError();
      }
    }

    if (!isDelaySatisfied) {
      const delayReservation = await reserveDelaySlot(now);

      if (!delayReservation.isImmediate && delayReservation.delayMs > 0) {
        console.log(`Minimum send delay: ${delayReservation.minDelayMs}ms`);
        console.log(
          `Send slot reserved for email ${emailId} at: ${new Date(delayReservation.reservedTime).toISOString()}`
        );
        console.log(`Email ${emailId} delayed by: ${delayReservation.delayMs}ms`);

        // Attach pre-reserved timestamp to job data
        job.data.reservedSendTime = delayReservation.reservedTime;
        await job.updateData(job.data);

        // Release hourly slot temporarily so quota is not held while waiting
        await releaseSlot();

        await job.moveToDelayed(delayReservation.reservedTime, job.token);
        throw new DelayedError();
      }

      console.log(
        `Send slot reserved for email ${emailId} immediately (${delayReservation.minDelayMs}ms delay satisfied)`
      );
    }

    // 5. Resolve Sender Information if sender_id exists
    let fromHeader: string | undefined = undefined;
    if (email.sender_id) {
      const sender = await senderRepository.getSenderByIdUnchecked(email.sender_id);
      if (sender) {
        fromHeader = sender.name ? `"${sender.name}" <${sender.email}>` : sender.email;
        console.log(`Resolved Sender ID ${email.sender_id}: ${fromHeader}`);
      } else {
        console.log(`Sender ID ${email.sender_id} no longer exists. Falling back to default Ethereal From.`);
      }
    }

    // 6. Mark as processing & increment attempts
    await emailRepository.markAsProcessing(emailId);
    await updateEmailStatusInIndex(emailId, 'processing');

    console.log(`Sending email ${emailId} via Ethereal SMTP...`);
    console.log(`From: ${fromHeader || '(Default Ethereal From)'}`);
    console.log(`Recipient: ${email.recipient}`);
    console.log(`Subject: ${email.subject}`);

    try {
      // 7. Send email via Nodemailer SMTP
      const sendResult = await sendEmail({
        from: fromHeader,
        recipient: email.recipient,
        subject: email.subject,
        body: email.body,
      });

      // 8. Update status to sent & set sent_at
      await emailRepository.markAsSent(emailId);
      await updateEmailStatusInIndex(emailId, 'sent', new Date());

      console.log(`[Worker] Email ${emailId} sent successfully`);
      console.log(`Message ID: ${sendResult.messageId}`);
      if (sendResult.previewUrl) {
        console.log(`Ethereal Preview URL: ${sendResult.previewUrl}`);
      }

      return {
        status: 'sent',
        emailId,
        messageId: sendResult.messageId,
        previewUrl: sendResult.previewUrl,
      };
    } catch (smtpError: any) {
      console.error(`Failed to send Email ${emailId} via SMTP:`, smtpError.message || smtpError);

      // Release reserved hourly rate limit slot on SMTP failure
      await releaseSlot();
      await emailRepository.markAsFailed(emailId);
      await updateEmailStatusInIndex(emailId, 'failed');
      throw smtpError;
    }
  },
  {
    connection: redisOptions,
    concurrency,
  }
);

emailWorker.on('completed', (job: Job<EmailJobData>) => {
  console.log(`Worker completed job ${job.id}`);
});

emailWorker.on('failed', (job: Job<EmailJobData> | undefined, err: Error) => {
  if (err.name !== 'DelayedError') {
    console.error(`Worker job ${job?.id || 'unknown'} failed:`, err.message);
  }
});

emailWorker.on('error', (err: Error) => {
  console.error('Email worker encountered an error:', err.message);
});

console.log(`[Worker] BullMQ worker started`);
console.log(`[Worker] Concurrency: ${concurrency}`);

// Run recovery on standalone worker startup if main script is emailWorker.ts
if (require.main === module) {
  reconcileScheduledEmails().catch((err) => {
    console.error('[Worker] Error during worker startup recovery:', err);
  });
}

