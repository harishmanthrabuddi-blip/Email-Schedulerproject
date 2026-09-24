import React, { useEffect, useState, useCallback, FormEvent } from 'react';
import { api } from '../services/api';
import { Sender } from '../types';

interface SenderManagerProps {
  onSendersUpdated?: (senders: Sender[]) => void;
  addToast?: (type: 'success' | 'warning' | 'error', text: string) => void;
}

export const SenderManager: React.FC<SenderManagerProps> = ({ onSendersUpdated, addToast }) => {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Form modal state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingSender, setEditingSender] = useState<Sender | null>(null);
  const [formEmail, setFormEmail] = useState<string>('');
  const [formName, setFormName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Delete confirmation state
  const [deletingSender, setDeletingSender] = useState<Sender | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const fetchSenders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getSenders();
      setSenders(data || []);
      if (onSendersUpdated) {
        onSendersUpdated(data || []);
      }
    } catch (err: any) {
      console.error('Failed to load senders:', err);
      setError(err.message || 'Unable to load senders.');
    } finally {
      setIsLoading(false);
    }
  }, [onSendersUpdated]);

  useEffect(() => {
    fetchSenders();
  }, [fetchSenders]);

  const handleOpenAddModal = () => {
    setEditingSender(null);
    setFormEmail('');
    setFormName('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (sender: Sender) => {
    setEditingSender(sender);
    setFormEmail(sender.email);
    setFormName(sender.name || '');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingSender(null);
    setFormEmail('');
    setFormName('');
  };

  const handleSubmitForm = async (e: FormEvent) => {
    e.preventDefault();

    if (!formEmail.trim()) {
      if (addToast) addToast('warning', 'Sender email address is required');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingSender) {
        // Update existing sender
        const updated = await api.updateSender(editingSender.id, {
          email: formEmail.trim(),
          name: formName.trim() || undefined,
        });
        if (addToast) addToast('success', `Updated sender ${updated.email}`);
      } else {
        // Create new sender
        const created = await api.createSender({
          email: formEmail.trim(),
          name: formName.trim() || undefined,
        });
        if (addToast) addToast('success', `Added sender ${created.email}`);
      }
      handleCloseModal();
      fetchSenders();
    } catch (err: any) {
      if (addToast) addToast('error', err.message || 'Failed to save sender');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingSender) return;

    setIsDeleting(true);
    try {
      await api.deleteSender(deletingSender.id);
      if (addToast) addToast('success', `Deleted sender ${deletingSender.email}`);
      setDeletingSender(null);
      fetchSenders();
    } catch (err: any) {
      if (addToast) addToast('error', err.message || 'Failed to delete sender');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight">Sender Email Accounts</h3>
          <p className="text-xs text-slate-400 mt-1">
            Configure multiple outgoing From addresses used when dispatching scheduled campaigns.
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2 px-3.5 rounded-xl shadow-md transition cursor-pointer flex items-center space-x-1.5 self-start sm:self-auto"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>+ Add Sender</span>
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <div className="h-12 bg-slate-950 animate-pulse rounded-xl border border-slate-800"></div>
          <div className="h-12 bg-slate-950 animate-pulse rounded-xl border border-slate-800"></div>
        </div>
      ) : error ? (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-center text-rose-400 text-xs">
          <p>{error}</p>
          <button
            onClick={fetchSenders}
            className="mt-2 px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 rounded-lg font-semibold transition cursor-pointer"
          >
            Try Again
          </button>
        </div>
      ) : senders.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
          <p className="text-slate-400 text-xs font-medium">No sender accounts configured.</p>
          <p className="text-slate-500 text-[11px] mt-1">Add a sender address to customize your outgoing email From headers.</p>
          <button
            onClick={handleOpenAddModal}
            className="mt-3 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
          >
            + Add First Sender
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {senders.map((sender) => (
            <div
              key={sender.id}
              className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl p-4 flex items-center justify-between transition group"
            >
              <div className="space-y-0.5">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-semibold text-white font-mono">{sender.email}</span>
                </div>
                <div className="text-xs text-slate-400">
                  {sender.name ? (
                    <span>Display Name: <strong className="text-slate-300">{sender.name}</strong></span>
                  ) : (
                    <span className="text-slate-500 italic">No display name set</span>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-2 opacity-90 group-hover:opacity-100">
                <button
                  onClick={() => handleOpenEditModal(sender)}
                  className="px-2.5 py-1 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition cursor-pointer"
                >
                  Edit
                </button>
                <button
                  onClick={() => setDeletingSender(sender)}
                  className="px-2.5 py-1 text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg transition cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Sender Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <h4 className="text-base font-bold text-white">
                {editingSender ? 'Edit Sender Account' : 'Add New Sender Account'}
              </h4>
              <button
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Sender Email Address <span className="text-rose-400">*</span>
                </label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="e.g. marketing@yourdomain.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 transition font-mono"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Display Name <span className="text-slate-500 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Acme Marketing Team"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 transition"
                />
                <p className="text-[11px] text-slate-500">
                  Will appear as "Acme Marketing Team" &lt;sender@yourdomain.com&gt; in recipient inboxes.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : editingSender ? 'Save Changes' : 'Create Sender'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingSender && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>

            <div>
              <h4 className="text-base font-bold text-white">Delete Sender Account?</h4>
              <p className="text-xs text-slate-400 mt-1">
                Are you sure you want to delete <strong className="text-white font-mono">{deletingSender.email}</strong>?
              </p>
              <p className="text-[11px] text-amber-400/90 mt-2 bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg">
                This will not delete historical email logs. Sender ID on existing emails will safely become NULL.
              </p>
            </div>

            <div className="flex items-center justify-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingSender(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 border border-slate-700 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl shadow-md transition cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete Sender'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
