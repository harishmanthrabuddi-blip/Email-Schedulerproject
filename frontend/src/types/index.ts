export interface UserProfile {
  id: number;
  name: string;
  email: string;
  avatar: string | null;
  googleId: string | null;
  createdAt?: string;
}

export interface Sender {
  id: number;
  userId?: number;
  email: string;
  name: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type EmailStatus = 'scheduled' | 'processing' | 'sent' | 'failed';

export interface EmailRecord {
  id: number;
  senderId?: number | null;
  recipient: string;
  subject: string;
  body?: string;
  scheduledAt: string;
  sentAt?: string | null;
  status: EmailStatus;
  queueJobId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface LeadParseResult {
  validEmails: string[];
  invalidCount: number;
  filename: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'warning' | 'error';
  text: string;
}

export interface SlackStatus {
  connected: boolean;
  teamId?: string | null;
  channelId?: string | null;
  channelName?: string | null;
}

export interface SlackChannel {
  id: string;
  name: string;
}

export interface SearchEmailsResult {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  data: EmailRecord[];
  reachable?: boolean;
}

export interface ScheduleEmailPayload {
  senderId?: number | null;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
  idempotencyKey: string;
}

export interface QueueCounts {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
}

export interface UserQueueCounts {
  scheduled: number;
  processing: number;
  sent: number;
  failed: number;
}

export interface QueueStats {
  queueName: string;
  globalCounts: QueueCounts;
  myCounts: UserQueueCounts;
}

export interface QueueJobDetails {
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

export interface GetQueueJobsResult {
  jobs: QueueJobDetails[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface QueueHealthInfo {
  redis: string;
  queue: string;
  queueName: string;
  workerConcurrency: number;
  workerStatus: string;
}
