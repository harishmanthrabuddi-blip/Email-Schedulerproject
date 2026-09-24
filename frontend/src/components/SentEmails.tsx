import React, { useEffect, useState, useCallback, FormEvent } from 'react';
import { api } from '../services/api';
import { EmailRecord } from '../types';
import { LoadingState } from './LoadingState';
import { EmptyState } from './EmptyState';

interface SentEmailsProps {
  onSentCountFetched?: (count: number) => void;
  addToast?: (type: 'success' | 'warning' | 'error', text: string) => void;
}

export const SentEmails: React.FC<SentEmailsProps> = ({ onSentCountFetched, addToast }) => {
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [limit] = useState<number>(10);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeQuery, setActiveQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isReindexing, setIsReindexing] = useState<boolean>(false);
  const [isEsReachable, setIsEsReachable] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSentEmails = useCallback(
    async (currentPage: number, queryText: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await api.searchEmails({
          status: 'sent',
          q: queryText.trim() || undefined,
          page: currentPage,
          limit,
        });

        setEmails(res.data || []);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);
        setIsEsReachable(res.reachable !== false);

        if (onSentCountFetched) {
          onSentCountFetched(res.total || 0);
        }
      } catch (err: any) {
        console.error('Failed to search sent emails:', err);
        setError(err.message || 'Failed to fetch sent emails');
      } finally {
        setIsLoading(false);
      }
    },
    [limit, onSentCountFetched]
  );

  useEffect(() => {
    fetchSentEmails(page, activeQuery);
  }, [fetchSentEmails, page, activeQuery]);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setActiveQuery(searchQuery);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setActiveQuery('');
    setPage(1);
  };

  const handleReindex = async () => {
    setIsReindexing(true);
    try {
      const res = await fetch('/api/emails/search/reindex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Reindexing failed');
      }
      if (addToast) {
        addToast('success', `Elasticsearch reindexed ${data.indexedCount || 0} record(s).`);
      }
      fetchSentEmails(page, activeQuery);
    } catch (err: any) {
      if (addToast) {
        addToast('error', err.message || 'Failed to trigger Elasticsearch reindex');
      }
    } finally {
      setIsReindexing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Sent Email History</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Full-text Elasticsearch indexing of delivered emails and recipient logs.
          </p>
        </div>

        <button
          onClick={handleReindex}
          disabled={isReindexing}
          className="self-start sm:self-auto bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold py-2 px-3.5 rounded-xl border border-slate-700 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
        >
          <svg
            className={`w-3.5 h-3.5 ${isReindexing ? 'animate-spin' : ''}`}
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
          <span>{isReindexing ? 'Reindexing ES...' : 'Reindex Elasticsearch'}</span>
        </button>
      </div>

      {!isEsReachable && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-xs text-amber-300 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-amber-400">⚡ Elasticsearch Offline:</span>
            <span>Displaying sent email history directly from MySQL database fallback.</span>
          </div>
          <span className="text-[11px] text-amber-400/80 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 font-mono">
            MySQL Mode
          </span>
        </div>
      )}

      {/* Search Input Bar */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by recipient or subject keyword (Elasticsearch)..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <button
          type="submit"
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-md transition cursor-pointer"
        >
          Search
        </button>
      </form>

      {/* Search Active Filter Pill */}
      {activeQuery && (
        <div className="flex items-center space-x-2 text-xs text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-lg w-fit">
          <span>Active Search Filter: "{activeQuery}"</span>
          <button onClick={handleClearSearch} className="hover:text-white font-bold ml-1">
            ✕
          </button>
        </div>
      )}

      {/* Main Table / Loading / Empty */}
      {isLoading ? (
        <LoadingState count={4} />
      ) : error ? (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6 text-center text-rose-400 text-sm">
          <p>{error}</p>
          <button
            onClick={() => fetchSentEmails(page, activeQuery)}
            className="mt-3 px-4 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 rounded-lg text-xs font-semibold transition"
          >
            Retry Search
          </button>
        </div>
      ) : emails.length === 0 ? (
        <EmptyState
          title={activeQuery ? 'No Matching Sent Emails Found' : 'No Sent Emails Yet'}
          description={
            activeQuery
              ? `No sent emails matched your query "${activeQuery}". Try another keyword or clear the search.`
              : 'Emails will appear here automatically once processed and delivered by BullMQ worker & Ethereal SMTP.'
          }
          actionText={activeQuery ? 'Clear Search' : undefined}
          onAction={activeQuery ? handleClearSearch : undefined}
        />
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/80 text-xs uppercase font-semibold text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6">Recipient</th>
                  <th className="py-3.5 px-4 sm:px-6">Subject</th>
                  <th className="py-3.5 px-4 sm:px-6">Sent At</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                {emails.map((email) => (
                  <tr key={email.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-4 px-4 sm:px-6 font-sans font-medium text-white max-w-[220px] truncate">
                      {email.recipient}
                    </td>
                    <td className="py-4 px-4 sm:px-6 font-sans text-slate-200 max-w-[320px] truncate">
                      {email.subject}
                    </td>
                    <td className="py-4 px-4 sm:px-6 text-slate-400">
                      {email.sentAt ? new Date(email.sentAt).toLocaleString() : 'N/A'}
                    </td>
                    <td className="py-4 px-4 sm:px-6 text-right font-sans">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Sent
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          <div className="bg-slate-950/50 px-6 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <div>
              Showing <span className="font-semibold text-white">{emails.length}</span> of{' '}
              <span className="font-semibold text-white">{total}</span> total sent email(s)
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
  );
};
