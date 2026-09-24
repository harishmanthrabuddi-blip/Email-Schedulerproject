import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { EmailRecord } from '../types';
import { LoadingState } from './LoadingState';
import { EmptyState } from './EmptyState';

interface ScheduledEmailsProps {
  onEmailsFetched?: (emails: EmailRecord[]) => void;
}

export const ScheduledEmails: React.FC<ScheduledEmailsProps> = ({ onEmailsFetched }) => {
  const navigate = useNavigate();
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchScheduled = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.getScheduledEmails();
      setEmails(res.emails || []);
      if (onEmailsFetched) {
        onEmailsFetched(res.emails || []);
      }
    } catch (err: any) {
      console.error('Failed to fetch scheduled emails:', err);
      setError(err.message || 'Failed to load scheduled emails');
    } finally {
      setIsLoading(false);
    }
  }, [onEmailsFetched]);

  useEffect(() => {
    fetchScheduled();
  }, [fetchScheduled]);

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5 animate-pulse"></span>
            Scheduled
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mr-1.5 animate-ping"></span>
            Processing
          </span>
        );
      case 'sent':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Sent
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Scheduled Email Queue</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Active and pending emails scheduled in BullMQ for automated SMTP sending.
          </p>
        </div>

        <button
          onClick={fetchScheduled}
          disabled={isLoading}
          className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold py-2 px-3.5 rounded-xl border border-slate-700 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
        >
          <svg
            className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span>Refresh Queue</span>
        </button>
      </div>

      {isLoading ? (
        <LoadingState count={4} />
      ) : error ? (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6 text-center text-rose-400 text-sm">
          <p>{error}</p>
          <button
            onClick={fetchScheduled}
            className="mt-3 px-4 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 rounded-lg text-xs font-semibold transition"
          >
            Retry
          </button>
        </div>
      ) : emails.length === 0 ? (
        <EmptyState
          title="No Scheduled Emails"
          description="You don't have any pending emails in the schedule queue. Compose a new email campaign to get started."
          actionText="Compose Email"
          onAction={() => navigate('/compose')}
        />
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/80 text-xs uppercase font-semibold text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6">Recipient</th>
                  <th className="py-3.5 px-4 sm:px-6">Subject</th>
                  <th className="py-3.5 px-4 sm:px-6">Scheduled Time</th>
                  <th className="py-3.5 px-4 sm:px-6">Job ID</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                {emails.map((email) => (
                  <tr key={email.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-4 px-4 sm:px-6 font-sans font-medium text-white max-w-[200px] truncate">
                      {email.recipient}
                    </td>
                    <td className="py-4 px-4 sm:px-6 font-sans text-slate-200 max-w-[280px] truncate">
                      {email.subject}
                    </td>
                    <td className="py-4 px-4 sm:px-6 text-slate-400">
                      {new Date(email.scheduledAt).toLocaleString()}
                    </td>
                    <td className="py-4 px-4 sm:px-6 text-slate-500">
                      {email.queueJobId || `email-${email.id}`}
                    </td>
                    <td className="py-4 px-4 sm:px-6 text-right font-sans">
                      {renderStatusBadge(email.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-slate-950/50 px-6 py-3 border-t border-slate-800 text-xs text-slate-500 flex justify-between items-center">
            <span>Total Scheduled: {emails.length} item(s)</span>
            <span>Managed by BullMQ & Redis</span>
          </div>
        </div>
      )}
    </div>
  );
};
