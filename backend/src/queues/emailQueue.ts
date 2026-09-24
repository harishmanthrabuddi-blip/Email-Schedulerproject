import { Queue } from 'bullmq';
import { redisOptions } from '../config/redis';

export interface EmailJobData {
  emailId: number;
  recipient: string;
  reservedSendTime?: number;
}

export const EMAIL_QUEUE_NAME = 'email-scheduler';

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: redisOptions,
});
