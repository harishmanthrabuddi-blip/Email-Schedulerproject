import React, { useEffect, useState, useCallback, ChangeEvent, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { LeadParseResult, Sender } from '../types';

interface ComposeEmailProps {
  addToast: (type: 'success' | 'warning' | 'error', text: string) => void;
  onScheduledSuccess?: () => void;
}

export const ComposeEmail: React.FC<ComposeEmailProps> = ({ addToast, onScheduledSuccess }) => {
  const navigate = useNavigate();

  // Helper to format ISO date string for datetime-local input
  const formatDateTimeLocal = (date: Date) => {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 19);
  };

  const getDefaultScheduledTime = () => {
    return formatDateTimeLocal(new Date(Date.now() + 15 * 1000)); // Now + 15 seconds
  };

  const [senders, setSenders] = useState<Sender[]>([]);
  const [selectedSenderId, setSelectedSenderId] = useState<string>('');
  const [isSendersLoading, setIsSendersLoading] = useState<boolean>(true);
  const [sendersError, setSendersError] = useState<string | null>(null);

  const [recipientsInput, setRecipientsInput] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [body, setBody] = useState<string>('');
  const [scheduledAtLocal, setScheduledAtLocal] = useState<string>(getDefaultScheduledTime());
  const [minSendDelayMs, setMinSendDelayMs] = useState<number>(2000);
  const [emailsPerHour, setEmailsPerHour] = useState<number>(10);

  const [leadParseResult, setLeadParseResult] = useState<LeadParseResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitProgress, setSubmitProgress] = useState<{ current: number; total: number } | null>(null);

  // Fetch senders on mount
  const fetchSenders = useCallback(async () => {
    setIsSendersLoading(true);
    setSendersError(null);
    try {
      const data = await api.getSenders();
      setSenders(data || []);
      if (data && data.length === 1) {
        // Auto-select single sender
        setSelectedSenderId(String(data[0].id));
      } else {
        setSelectedSenderId('');
      }
    } catch (err: any) {
      console.error('Failed to load senders for compose:', err);
      setSendersError(err.message || 'Unable to load senders.');
    } finally {
      setIsSendersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSenders();
  }, [fetchSenders]);

  // Helper to parse emails from raw string or file content
  const parseEmailsFromString = (text: string, filename: string = 'manual-input'): LeadParseResult => {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matched = text.match(emailRegex) || [];

    const validEmails: string[] = [];
    const seen = new Set<string>();
    let invalidCount = 0;

    const rawTokens = text.split(/[\s,;\n]+/).filter(Boolean);

    for (const token of rawTokens) {
      const trimmed = token.trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        if (!seen.has(trimmed)) {
          seen.add(trimmed);
          validEmails.push(trimmed);
        }
      } else {
        invalidCount++;
      }
    }

    for (const match of matched) {
      const lower = match.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        validEmails.push(lower);
      }
    }

    return {
      validEmails,
      invalidCount,
      filename,
    };
  };

  const handleRecipientsChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setRecipientsInput(val);
    if (val.trim()) {
      const parsed = parseEmailsFromString(val, 'Direct Text');
      setLeadParseResult(parsed);
    } else {
      setLeadParseResult(null);
    }
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const parsed = parseEmailsFromString(content, file.name);
        setRecipientsInput(parsed.validEmails.join(', '));
        setLeadParseResult(parsed);
        addToast(
          'success',
          `Parsed ${parsed.validEmails.length} valid email(s) from ${file.name}`
        );
      }
    };
    reader.onerror = () => {
      addToast('error', 'Failed to read the uploaded lead file');
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    let targetEmails = leadParseResult?.validEmails || [];
    if (targetEmails.length === 0 && recipientsInput.trim()) {
      const parsed = parseEmailsFromString(recipientsInput);
      targetEmails = parsed.validEmails;
    }

    if (targetEmails.length === 0) {
      addToast('warning', 'Please provide at least one valid recipient email address.');
      return;
    }

    if (senders.length > 1 && !selectedSenderId) {
      addToast('warning', 'Please select a sender.');
      return;
    }

    if (!subject.trim()) {
      addToast('warning', 'Subject line is required.');
      return;
    }

    if (!body.trim()) {
      addToast('warning', 'Email body is required.');
      return;
    }

    const scheduledDate = new Date(scheduledAtLocal);
    if (isNaN(scheduledDate.getTime())) {
      addToast('warning', 'Please specify a valid future date and time.');
      return;
    }

    if (scheduledDate.getTime() <= Date.now()) {
      addToast('warning', 'Scheduled start time must be in the future.');
      return;
    }

    setIsSubmitting(true);
    setSubmitProgress({ current: 0, total: targetEmails.length });

    const total = targetEmails.length;
    let successCount = 0;
    let failCount = 0;

    const BATCH_SIZE = 5;
    const parsedSenderId = selectedSenderId ? parseInt(selectedSenderId, 10) : undefined;

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = targetEmails.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (recipient, batchIdx) => {
          const index = i + batchIdx;
          const idempotencyKey = `schedule-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`;
          
          try {
            await api.scheduleEmail({
              senderId: parsedSenderId,
              recipient,
              subject: subject.trim(),
              body: body.trim(),
              scheduledAt: scheduledDate.toISOString(),
              idempotencyKey,
            });
            successCount++;
          } catch (err: any) {
            console.error(`Failed to schedule email for ${recipient}:`, err);
            failCount++;
          } finally {
            setSubmitProgress((prev) => ({
              current: Math.min((prev?.current || 0) + 1, total),
              total,
            }));
          }
        })
      );
    }

    setIsSubmitting(false);
    setSubmitProgress(null);

    if (successCount > 0) {
      addToast('success', `Successfully scheduled ${successCount} email(s)!`);
      if (onScheduledSuccess) {
        onScheduledSuccess();
      }
      navigate('/scheduled');
    }

    if (failCount > 0) {
      addToast('error', `Failed to schedule ${failCount} email(s).`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
        <div className="flex items-center justify-between pb-6 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Compose Scheduled Email</h2>
            <p className="text-sm text-slate-400 mt-1">
              Select sender account, upload leads, configure delays, and enqueue automated campaigns.
            </p>
          </div>
          <span className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold rounded-full">
            BullMQ Queue Integrated
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Sender Selection Dropdown / Alert */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-200">
              Sender Account <span className="text-rose-400">*</span>
            </label>

            {isSendersLoading ? (
              <div className="h-10 bg-slate-950 border border-slate-800 rounded-xl animate-pulse text-xs text-slate-500 flex items-center px-4">
                Loading senders...
              </div>
            ) : sendersError ? (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-xs text-rose-400 flex justify-between items-center">
                <span>{sendersError}</span>
                <button
                  type="button"
                  onClick={fetchSenders}
                  className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 rounded-lg text-xs font-semibold transition"
                >
                  Try Again
                </button>
              </div>
            ) : senders.length === 0 ? (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-xs text-amber-300 flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
                  </svg>
                  <span>No senders configured. Please add a sender account before scheduling.</span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-white font-semibold rounded-lg transition"
                >
                  + Add Sender
                </button>
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedSenderId}
                  onChange={(e) => setSelectedSenderId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition appearance-none font-mono"
                  required={senders.length > 1}
                >
                  {senders.length > 1 && (
                    <option value="">-- Select a sender account --</option>
                  )}
                  {senders.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name ? `${s.name} <${s.email}>` : s.email}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            )}
          </div>

          {/* File Upload & Recipients Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-semibold text-slate-200">
                Recipients / Lead Upload
              </label>
              <label className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer transition flex items-center space-x-1">
                <svg className="w-4 h-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span>Upload CSV / TXT File</span>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <textarea
              rows={4}
              value={recipientsInput}
              onChange={handleRecipientsChange}
              placeholder="Enter recipient email addresses separated by commas or newlines (e.g. user1@example.com, user2@example.com)..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition resize-y font-mono"
            />

            {/* Parsing summary badge */}
            {leadParseResult && (
              <div className="flex flex-wrap items-center gap-3 bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-xs">
                <div className="flex items-center space-x-2 text-emerald-400 font-medium">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{leadParseResult.validEmails.length} Valid Email(s)</span>
                </div>
                {leadParseResult.invalidCount > 0 && (
                  <div className="flex items-center space-x-2 text-amber-400 font-medium">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
                    </svg>
                    <span>{leadParseResult.invalidCount} Invalid/Duplicate Ignored</span>
                  </div>
                )}
                {leadParseResult.filename && (
                  <span className="text-slate-500 ml-auto font-mono">Source: {leadParseResult.filename}</span>
                )}
              </div>
            )}
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-200">Email Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Special Offer & Update for Q3"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              required
            />
          </div>

          {/* Body */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-200">Email Body</label>
            <textarea
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your email content here (PlainText / Markdown supported)..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition resize-y"
              required
            />
          </div>

          {/* Scheduling & Rate Limits Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {/* Start Time */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-300">
                  Scheduled Start Time
                </label>
                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={() => setScheduledAtLocal(formatDateTimeLocal(new Date(Date.now() + 15 * 1000)))}
                    className="text-[10px] bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 px-1.5 py-0.5 rounded cursor-pointer transition"
                    title="Send in 15 seconds"
                  >
                    +15s
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduledAtLocal(formatDateTimeLocal(new Date(Date.now() + 60 * 1000)))}
                    className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded cursor-pointer transition"
                    title="Send in 1 minute"
                  >
                    +1m
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduledAtLocal(formatDateTimeLocal(new Date(Date.now() + 5 * 60 * 1000)))}
                    className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded cursor-pointer transition"
                    title="Send in 5 minutes"
                  >
                    +5m
                  </button>
                </div>
              </div>
              <input
                type="datetime-local"
                step="1"
                value={scheduledAtLocal}
                onChange={(e) => setScheduledAtLocal(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 transition font-mono"
                required
              />
              <p className="text-[11px] text-slate-500">Must be a future date/time</p>
            </div>

            {/* Min Send Delay */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Min Global Send Delay (ms)
              </label>
              <input
                type="number"
                min="0"
                step="500"
                value={minSendDelayMs}
                onChange={(e) => setMinSendDelayMs(parseInt(e.target.value, 10) || 0)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 transition font-mono"
              />
              <p className="text-[11px] text-slate-500">Global delay between sends</p>
            </div>

            {/* Hourly Rate Limit */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Emails Per Hour Limit
              </label>
              <input
                type="number"
                min="1"
                max="1000"
                value={emailsPerHour}
                onChange={(e) => setEmailsPerHour(parseInt(e.target.value, 10) || 10)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 transition font-mono"
              />
              <p className="text-[11px] text-slate-500">Redis rate limiter window</p>
            </div>
          </div>

          {/* Progress Indicator during batch submission */}
          {submitProgress && (
            <div className="bg-slate-950 border border-indigo-500/30 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-indigo-400">Scheduling Emails in Batches...</span>
                <span className="text-slate-300 font-mono">
                  {submitProgress.current} / {submitProgress.total}
                </span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-500 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${(submitProgress.current / submitProgress.total) * 100}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Submit Actions */}
          <div className="flex items-center justify-end space-x-4 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => navigate('/scheduled')}
              className="px-5 py-2.5 rounded-xl border border-slate-800 text-slate-300 hover:text-white text-sm font-semibold transition"
              disabled={isSubmitting}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting || senders.length === 0}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold px-6 py-2.5 rounded-xl shadow-lg shadow-indigo-600/20 transition flex items-center space-x-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Submitting Jobs...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  <span>Schedule Email Batch</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
