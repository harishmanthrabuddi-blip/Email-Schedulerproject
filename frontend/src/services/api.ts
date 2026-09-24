import {
  UserProfile,
  Sender,
  EmailRecord,
  SearchEmailsResult,
  ScheduleEmailPayload,
  SlackStatus,
  SlackChannel,
  QueueStats,
  QueueJobDetails,
  GetQueueJobsResult,
  QueueHealthInfo,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
    credentials: 'include', // Ensure HTTP-only session cookie is sent with every request
  });

  if (response.status === 401) {
    throw new Error('UNAUTHORIZED');
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.error || data.message || `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return data as T;
}

export const api = {
  getAuthUser: async (): Promise<{ authenticated: boolean; user?: UserProfile }> => {
    return request<{ authenticated: boolean; user?: UserProfile }>('/api/auth/me');
  },

  logoutUser: async (): Promise<{ message: string }> => {
    return request<{ message: string }>('/api/auth/logout', { method: 'POST' });
  },

  getSenders: async (): Promise<Sender[]> => {
    return request<Sender[]>('/api/senders');
  },

  createSender: async (payload: { email: string; name?: string }): Promise<Sender> => {
    return request<Sender>('/api/senders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateSender: async (id: number, payload: { email: string; name?: string }): Promise<Sender> => {
    return request<Sender>(`/api/senders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  deleteSender: async (id: number): Promise<{ message: string }> => {
    return request<{ message: string }>(`/api/senders/${id}`, {
      method: 'DELETE',
    });
  },

  getScheduledEmails: async (): Promise<{ emails: EmailRecord[] }> => {
    return request<{ emails: EmailRecord[] }>('/api/emails/scheduled');
  },

  scheduleEmail: async (payload: ScheduleEmailPayload): Promise<{ message: string; email: EmailRecord }> => {
    return request<{ message: string; email: EmailRecord }>('/api/emails/schedule', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  sendEmailNow: async (id: number): Promise<{ message: string; emailId: number; previewUrl?: string }> => {
    return request<{ message: string; emailId: number; previewUrl?: string }>(`/api/emails/${id}/send-now`, {
      method: 'POST',
    });
  },

  searchEmails: async (params: {
    status?: string;
    q?: string;
    page?: number;
    limit?: number;
  }): Promise<SearchEmailsResult> => {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.q) query.set('q', params.q);
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));

    const path = `/api/emails/search?${query.toString()}`;
    return request<SearchEmailsResult>(path);
  },

  getSlackStatus: async (): Promise<SlackStatus> => {
    return request<SlackStatus>('/api/slack/status');
  },

  getSlackChannels: async (): Promise<{ channels: SlackChannel[] }> => {
    return request<{ channels: SlackChannel[] }>('/api/slack/channels');
  },

  setSlackChannel: async (channelId: string): Promise<{ message: string; channelId: string }> => {
    return request<{ message: string; channelId: string }>('/api/slack/channel', {
      method: 'POST',
      body: JSON.stringify({ channelId }),
    });
  },

  disconnectSlack: async (): Promise<{ message: string }> => {
    return request<{ message: string }>('/api/slack/disconnect', { method: 'POST' });
  },

  // BullMQ Live Dashboard Queue Endpoints
  getQueueStats: async (): Promise<QueueStats> => {
    return request<QueueStats>('/api/queue/stats');
  },

  getQueueJobs: async (params: { status?: string; page?: number; limit?: number }): Promise<GetQueueJobsResult> => {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));

    return request<GetQueueJobsResult>(`/api/queue/jobs?${query.toString()}`);
  },

  getQueueJobDetails: async (jobId: string): Promise<QueueJobDetails> => {
    return request<QueueJobDetails>(`/api/queue/jobs/${jobId}`);
  },

  getQueueHealth: async (): Promise<QueueHealthInfo> => {
    return request<QueueHealthInfo>('/api/queue/health');
  },
};
