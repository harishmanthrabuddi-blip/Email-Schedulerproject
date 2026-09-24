export type EmailStatus = 'scheduled' | 'processing' | 'sent' | 'failed';

export interface EmailRecord {
  id: number;
  user_id: number;
  sender_id: number | null;
  recipient: string;
  subject: string;
  body: string;
  scheduled_at: Date;
  sent_at: Date | null;
  status: EmailStatus;
  attempts: number;
  idempotency_key: string;
  queue_job_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateEmailInput {
  userId: number;
  senderId?: number | null;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: Date;
  idempotencyKey: string;
}
