import React from 'react';

interface StatsCardsProps {
  scheduledCount: number;
  sentCount: number;
  failedCount: number;
  isLoading?: boolean;
}

export const StatsCards: React.FC<StatsCardsProps> = ({
  scheduledCount,
  sentCount,
  failedCount,
  isLoading = false,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {/* Scheduled Card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-lg backdrop-blur-sm relative overflow-hidden group hover:border-amber-500/40 transition">
        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition"></div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Scheduled Emails</p>
            {isLoading ? (
              <div className="h-8 w-16 bg-slate-800 animate-pulse rounded-md mt-2"></div>
            ) : (
              <p className="text-3xl font-extrabold text-white mt-1">{scheduledCount}</p>
            )}
            <p className="text-xs text-amber-400/80 mt-2 font-medium">Pending send in BullMQ queue</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Sent Card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-lg backdrop-blur-sm relative overflow-hidden group hover:border-emerald-500/40 transition">
        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition"></div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Successfully Sent</p>
            {isLoading ? (
              <div className="h-8 w-16 bg-slate-800 animate-pulse rounded-md mt-2"></div>
            ) : (
              <p className="text-3xl font-extrabold text-white mt-1">{sentCount}</p>
            )}
            <p className="text-xs text-emerald-400/80 mt-2 font-medium">Delivered via SMTP & Indexed</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Failed Card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-lg backdrop-blur-sm relative overflow-hidden group hover:border-rose-500/40 transition">
        <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl group-hover:bg-rose-500/10 transition"></div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Delivery Errors</p>
            {isLoading ? (
              <div className="h-8 w-16 bg-slate-800 animate-pulse rounded-md mt-2"></div>
            ) : (
              <p className="text-3xl font-extrabold text-white mt-1">{failedCount}</p>
            )}
            <p className="text-xs text-rose-400/80 mt-2 font-medium">Failed or rate limit exhausted</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};
