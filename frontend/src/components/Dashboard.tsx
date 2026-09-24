import React, { useEffect, useState, useCallback } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { Header } from './Header';
import { StatsCards } from './StatsCards';
import { ScheduledEmails } from './ScheduledEmails';
import { SentEmails } from './SentEmails';
import { ComposeEmail } from './ComposeEmail';
import { SlackSettings } from './SlackSettings';
import { SenderManager } from './SenderManager';
import { QueueDashboard } from './QueueDashboard';
import { Toast } from './Toast';
import { UserProfile, ToastMessage } from '../types';
import { api } from '../services/api';

interface DashboardProps {
  user: UserProfile;
  onLogout: () => void;
}

interface SystemHealth {
  api: string;
  db: string;
  redis: string;
  elasticsearch: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const backendUrl = import.meta.env.VITE_API_URL || '';

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [scheduledCount, setScheduledCount] = useState<number>(0);
  const [sentCount, setSentCount] = useState<number>(0);
  const [failedCount, setFailedCount] = useState<number>(0);
  const [isStatsLoading, setIsStatsLoading] = useState<boolean>(true);

  const [health, setHealth] = useState<SystemHealth>({
    api: 'Checking...',
    db: 'Checking...',
    redis: 'Checking...',
    elasticsearch: 'Checking...',
  });

  const addToast = useCallback((type: 'success' | 'warning' | 'error', text: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, text }]);

    // Auto dismiss after 5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Fetch summary stats for dashboard cards
  const fetchSummaryStats = useCallback(async () => {
    setIsStatsLoading(true);
    try {
      const [scheduledRes, sentRes, failedRes] = await Promise.allSettled([
        api.getScheduledEmails(),
        api.searchEmails({ status: 'sent', limit: 1 }),
        api.searchEmails({ status: 'failed', limit: 1 }),
      ]);

      if (scheduledRes.status === 'fulfilled') {
        setScheduledCount(scheduledRes.value.emails?.length || 0);
      }
      if (sentRes.status === 'fulfilled') {
        setSentCount(sentRes.value.total || 0);
      }
      if (failedRes.status === 'fulfilled') {
        setFailedCount(failedRes.value.total || 0);
      }
    } catch (err) {
      console.error('Error fetching summary stats:', err);
    } finally {
      setIsStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummaryStats();

    // Fetch health status
    const checkHealth = async () => {
      try {
        const [apiRes, dbRes, redisRes, esRes] = await Promise.allSettled([
          fetch(`${backendUrl}/health`).then((r) => r.json()),
          fetch(`${backendUrl}/health/db`).then((r) => r.json()),
          fetch(`${backendUrl}/health/redis`).then((r) => r.json()),
          fetch(`${backendUrl}/health/elasticsearch`).then((r) => r.json()),
        ]);

        setHealth({
          api: apiRes.status === 'fulfilled' ? apiRes.value.status : 'offline',
          db: dbRes.status === 'fulfilled' ? dbRes.value.database : 'offline',
          redis: redisRes.status === 'fulfilled' ? redisRes.value.redis : 'offline',
          elasticsearch:
            esRes.status === 'fulfilled' ? esRes.value.elasticsearch : 'offline',
        });
      } catch (err) {
        console.error('Failed to fetch system health:', err);
      }
    };

    checkHealth();
  }, [backendUrl, fetchSummaryStats]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Sticky Header Navbar */}
      <Header user={user} onLogout={onLogout} />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <Routes>
          {/* Dashboard Main Overview */}
          <Route
            path="/"
            element={
              <div className="space-y-8">
                {/* Banner / Welcome */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-indigo-900/40 via-slate-900 to-slate-900 border border-indigo-500/20 rounded-2xl p-6 shadow-xl">
                  <div>
                    <h1 className="text-2xl font-extrabold text-white tracking-tight">
                      Welcome back, {user.name.split(' ')[0]} 👋
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">
                      Manage your scheduled email campaigns, rate limits, and Slack alert integrations.
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => navigate('/compose')}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2.5 px-4 rounded-xl shadow-lg shadow-indigo-600/20 transition cursor-pointer flex items-center space-x-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span>New Email Campaign</span>
                    </button>
                  </div>
                </div>

                {/* Summary Metrics Cards */}
                <StatsCards
                  scheduledCount={scheduledCount}
                  sentCount={sentCount}
                  failedCount={failedCount}
                  isLoading={isStatsLoading}
                />

                {/* System Infrastructure Health Grid */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                  <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
                    Infrastructure & Service Health
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80">
                      <span className="text-slate-500 block mb-1 font-medium">Backend Express API</span>
                      <span className={`font-semibold ${health.api === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {health.api}
                      </span>
                    </div>

                    <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80">
                      <span className="text-slate-500 block mb-1 font-medium">MySQL DB (Truth)</span>
                      <span className={`font-semibold ${health.db === 'connected' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {health.db}
                      </span>
                    </div>

                    <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80">
                      <span className="text-slate-500 block mb-1 font-medium">Redis Queue / Limiter</span>
                      <span className={`font-semibold ${health.redis === 'connected' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {health.redis}
                      </span>
                    </div>

                    <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80">
                      <span className="text-slate-500 block mb-1 font-medium">Elasticsearch Search</span>
                      <span className={`font-semibold ${health.elasticsearch === 'connected' ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {health.elasticsearch}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Scheduled Email Queue Preview */}
                <ScheduledEmails
                  onEmailsFetched={(emails) => setScheduledCount(emails.length)}
                  addToast={addToast}
                />

                {/* Sender Accounts Management Card */}
                <SenderManager addToast={addToast} />

                {/* Slack Rate Limit Notification Integration */}
                <SlackSettings />
              </div>
            }
          />

          {/* Scheduled Emails View */}
          <Route
            path="/scheduled"
            element={
              <ScheduledEmails
                onEmailsFetched={(emails) => setScheduledCount(emails.length)}
                addToast={addToast}
              />
            }
          />

          {/* Sent Emails Search View */}
          <Route
            path="/sent"
            element={
              <SentEmails
                onSentCountFetched={(count) => setSentCount(count)}
                addToast={addToast}
              />
            }
          />

          {/* BullMQ Queue Monitor View */}
          <Route path="/queue" element={<QueueDashboard />} />

          {/* Compose New Email View */}
          <Route
            path="/compose"
            element={
              <ComposeEmail
                addToast={addToast}
                onScheduledSuccess={fetchSummaryStats}
              />
            }
          />
        </Routes>
      </main>

      {/* Toast Alert Notifications Container */}
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};
