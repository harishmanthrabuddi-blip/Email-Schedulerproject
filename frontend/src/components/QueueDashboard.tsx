import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
import { QueueStats, QueueJobDetails, QueueHealthInfo } from '../types';
import { LoadingState } from './LoadingState';
import { EmptyState } from './EmptyState';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const QueueDashboard: React.FC = () => {
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [health, setHealth] = useState<QueueHealthInfo | null>(null);
  const [activeTab, setActiveTab] = useState<string>('delayed');
  const [jobs, setJobs] = useState<QueueJobDetails[]>([]);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalJobs, setTotalJobs] = useState<number>(0);
  const [limit] = useState<number>(20);

  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(true);
  const [isLoadingJobs, setIsLoadingJobs] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // SSE connection state
  const [isSseConnected, setIsSseConnected] = useState<boolean>(false);

  // Job Details Modal state
  const [selectedJob, setSelectedJob] = useState<QueueJobDetails | null>(null);

  // Fetch queue health & stats
  const fetchStatsAndHealth = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const [statsData, healthData] = await Promise.all([
        api.getQueueStats(),
        api.getQueueHealth(),
      ]);
      setStats(statsData);
      setHealth(healthData);
    } catch (err: any) {
      console.error('Failed to fetch queue stats/health:', err);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  // Fetch paginated jobs for active status tab
  const fetchJobs = useCallback(
    async (targetStatus: string, targetPage: number) => {
      setIsLoadingJobs(true);
      setError(null);
      try {
        const res = await api.getQueueJobs({
          status: targetStatus,
          page: targetPage,
          limit,
        });
        setJobs(res.jobs || []);
        setTotalJobs(res.total || 0);
        setTotalPages(res.totalPages || 1);
      } catch (err: any) {
        console.error('Failed to fetch queue jobs:', err);
        setError(err.message || 'Unable to load queue data.');
      } finally {
        setIsLoadingJobs(false);
      }
    },
    [limit]
  );

  useEffect(() => {
    fetchStatsAndHealth();
  }, [fetchStatsAndHealth]);

  useEffect(() => {
    fetchJobs(activeTab, page);
  }, [fetchJobs, activeTab, page]);

  // Setup Server-Sent Events (SSE) live updates
  useEffect(() => {
    let eventSource: EventSource | null = null;

    try {
      // EventSource with credentials
      eventSource = new EventSource(`${API_BASE_URL}/api/queue/events`, {
        withCredentials: true,
      });

      eventSource.addEventListener('connected', () => {
        setIsSseConnected(true);
      });

      eventSource.addEventListener('queue-update', () => {
        setIsSseConnected(true);
        // Refresh queue stats and current job tab view on queue state change
        fetchStatsAndHealth();
        fetchJobs(activeTab, page);
      });

      eventSource.onerror = () => {
        setIsSseConnected(false);
      };
    } catch (err) {
      console.error('Failed to initialize SSE EventSource:', err);
      setIsSseConnected(false);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [fetchStatsAndHealth, fetchJobs, activeTab, page]);

  const handleTabChange = (status: string) => {
    setActiveTab(status);
    setPage(1);
  };

  const handleOpenJobDetails = async (jobId: string) => {
    try {
      const details = await api.getQueueJobDetails(jobId);
      setSelectedJob(details);
    } catch (err: any) {
      console.error(`Failed to load job details for ${jobId}:`, err);
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'waiting':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            Waiting
          </span>
        );
      case 'active':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mr-1.5 animate-ping"></span>
            Active
          </span>
        );
      case 'delayed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5 animate-pulse"></span>
            Delayed
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Completed
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
    <div className="space-y-8">
      {/* Page Title & Live Connection Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-extrabold text-white tracking-tight">BullMQ Live Queue Monitor</h1>
            <span className="px-2.5 py-0.5 bg-slate-800 border border-slate-700 text-slate-300 text-xs font-mono rounded-full">
              Queue: {health?.queueName || 'email-scheduler'}
            </span>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            Real-time monitoring of persistent BullMQ jobs and Redis queue state.
          </p>
        </div>

        <div className="flex items-center space-x-3 self-start sm:self-auto">
          {/* SSE Status Pill */}
          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                isSseConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            ></span>
            <span className="text-slate-300 font-medium">
              {isSseConnected ? 'SSE Live Stream Active' : 'Live Updates Disconnected'}
            </span>
          </div>

          <button
            onClick={() => {
              fetchStatsAndHealth();
              fetchJobs(activeTab, page);
            }}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2 px-3.5 rounded-xl border border-slate-700 transition flex items-center space-x-1.5 cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Global Queue Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Waiting */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg text-center space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Waiting</span>
          {isLoadingStats ? (
            <div className="h-7 w-12 bg-slate-800 animate-pulse mx-auto rounded"></div>
          ) : (
            <p className="text-2xl font-extrabold text-indigo-400">{stats?.globalCounts.waiting || 0}</p>
          )}
          <span className="text-[11px] text-slate-500 block">Ready to pick up</span>
        </div>

        {/* Active */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg text-center space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Active</span>
          {isLoadingStats ? (
            <div className="h-7 w-12 bg-slate-800 animate-pulse mx-auto rounded"></div>
          ) : (
            <p className="text-2xl font-extrabold text-blue-400">{stats?.globalCounts.active || 0}</p>
          )}
          <span className="text-[11px] text-slate-500 block">Worker processing</span>
        </div>

        {/* Delayed */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg text-center space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Delayed</span>
          {isLoadingStats ? (
            <div className="h-7 w-12 bg-slate-800 animate-pulse mx-auto rounded"></div>
          ) : (
            <p className="text-2xl font-extrabold text-amber-400">{stats?.globalCounts.delayed || 0}</p>
          )}
          <span className="text-[11px] text-slate-500 block">Scheduled in future</span>
        </div>

        {/* Completed */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg text-center space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Completed</span>
          {isLoadingStats ? (
            <div className="h-7 w-12 bg-slate-800 animate-pulse mx-auto rounded"></div>
          ) : (
            <p className="text-2xl font-extrabold text-emerald-400">{stats?.globalCounts.completed || 0}</p>
          )}
          <span className="text-[11px] text-slate-500 block">Successfully executed</span>
        </div>

        {/* Failed */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg text-center space-y-1 col-span-2 md:col-span-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Failed</span>
          {isLoadingStats ? (
            <div className="h-7 w-12 bg-slate-800 animate-pulse mx-auto rounded"></div>
          ) : (
            <p className="text-2xl font-extrabold text-rose-400">{stats?.globalCounts.failed || 0}</p>
          )}
          <span className="text-[11px] text-slate-500 block">Job error / retry exhausted</span>
        </div>
      </div>

      {/* Queue Infrastructure Overview Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center space-x-6">
          <div>
            <span className="text-slate-500 font-medium">Redis Connection:</span>{' '}
            <span className={`font-semibold ${health?.redis === 'connected' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {health?.redis || 'Checking...'}
            </span>
          </div>

          <div>
            <span className="text-slate-500 font-medium">Worker Status:</span>{' '}
            <span className="font-semibold text-emerald-400">{health?.workerStatus || 'Running'}</span>
          </div>

          <div>
            <span className="text-slate-500 font-medium">Worker Concurrency:</span>{' '}
            <span className="font-semibold text-white font-mono">{health?.workerConcurrency || 5} concurrent threads</span>
          </div>
        </div>

        <div className="text-slate-500">
          User Email Jobs: <strong className="text-slate-200">{stats?.myCounts.scheduled || 0} Scheduled</strong>,{' '}
          <strong className="text-slate-200">{stats?.myCounts.sent || 0} Sent</strong>
        </div>
      </div>

      {/* Queue Job Table Section */}
      <div className="space-y-4">
        {/* Status Filter Tabs */}
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 overflow-x-auto text-xs font-medium">
          {['delayed', 'waiting', 'active', 'completed', 'failed'].map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`px-4 py-2 rounded-xl transition cursor-pointer capitalize font-semibold whitespace-nowrap ${
                activeTab === tab
                  ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              {tab} Jobs
            </button>
          ))}
        </div>

        {/* Table Content */}
        {isLoadingJobs ? (
          <LoadingState count={4} />
        ) : error ? (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6 text-center text-rose-400 text-sm">
            <p>{error}</p>
            <button
              onClick={() => fetchJobs(activeTab, page)}
              className="mt-3 px-4 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 rounded-lg text-xs font-semibold transition"
            >
              Retry
            </button>
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState
            title={`No ${activeTab.toUpperCase()} Jobs`}
            description={`There are currently no ${activeTab} jobs matching your user account in the BullMQ queue.`}
          />
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950/80 text-xs uppercase font-semibold text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4 sm:px-6">BullMQ Job ID</th>
                    <th className="py-3.5 px-4 sm:px-6">Email ID</th>
                    <th className="py-3.5 px-4 sm:px-6">Recipient</th>
                    <th className="py-3.5 px-4 sm:px-6">Attempts</th>
                    <th className="py-3.5 px-4 sm:px-6">Timestamp / Scheduled</th>
                    <th className="py-3.5 px-4 sm:px-6 text-right">Status</th>
                    <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                  {jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-4 px-4 sm:px-6 font-semibold text-white">
                        {job.id}
                      </td>
                      <td className="py-4 px-4 sm:px-6 text-slate-300">
                        #{job.data.emailId}
                      </td>
                      <td className="py-4 px-4 sm:px-6 font-sans text-slate-300 max-w-[180px] truncate">
                        {job.data.recipient || 'N/A'}
                      </td>
                      <td className="py-4 px-4 sm:px-6 text-slate-400">
                        {job.attemptsMade}
                      </td>
                      <td className="py-4 px-4 sm:px-6 text-slate-400">
                        {new Date(job.timestamp).toLocaleString()}
                      </td>
                      <td className="py-4 px-4 sm:px-6 text-right font-sans">
                        {renderStatusBadge(job.status)}
                      </td>
                      <td className="py-4 px-4 sm:px-6 text-right font-sans">
                        <button
                          onClick={() => handleOpenJobDetails(job.id)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition cursor-pointer"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="bg-slate-950/50 px-6 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <div>
                Showing <span className="font-semibold text-white">{jobs.length}</span> of{' '}
                <span className="font-semibold text-white">{totalJobs}</span> job(s)
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-40 disabled:hover:bg-slate-900 transition"
                >
                  Previous
                </button>
                <span className="font-mono text-slate-300">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-40 disabled:hover:bg-slate-900 transition"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Job Details Drawer/Modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <h4 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Job Metadata #{selectedJob.id}</span>
              </h4>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-500 font-sans">Queue Name</span>
                <span className="text-white">{health?.queueName || 'email-scheduler'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-500 font-sans">BullMQ Job ID</span>
                <span className="text-white">{selectedJob.id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-500 font-sans">MySQL Email ID</span>
                <span className="text-indigo-400">#{selectedJob.data.emailId}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-500 font-sans">Recipient</span>
                <span className="text-white font-sans">{selectedJob.data.recipient || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-500 font-sans">Current Status</span>
                <span className="font-sans capitalize">{renderStatusBadge(selectedJob.status)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-500 font-sans">Attempts Made</span>
                <span className="text-slate-300">{selectedJob.attemptsMade}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-500 font-sans">Delay Setting</span>
                <span className="text-slate-300">{selectedJob.delay} ms</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-500 font-sans">Created Timestamp</span>
                <span className="text-slate-400">{new Date(selectedJob.timestamp).toLocaleString()}</span>
              </div>
              {selectedJob.processedOn && (
                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-500 font-sans">Processed Timestamp</span>
                  <span className="text-slate-400">{new Date(selectedJob.processedOn).toLocaleString()}</span>
                </div>
              )}
              {selectedJob.finishedOn && (
                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-500 font-sans">Finished Timestamp</span>
                  <span className="text-slate-400">{new Date(selectedJob.finishedOn).toLocaleString()}</span>
                </div>
              )}

              {selectedJob.failedReason && (
                <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl space-y-1">
                  <span className="text-rose-400 font-bold font-sans block">Failure Error Details:</span>
                  <p className="text-rose-300 text-[11px] break-words">{selectedJob.failedReason}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-slate-800">
              <button
                onClick={() => setSelectedJob(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
