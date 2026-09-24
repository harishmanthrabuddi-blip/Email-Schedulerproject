import React, { useEffect, useState } from 'react';
import { SlackStatus, SlackChannel } from '../types';

export const SlackSettings: React.FC = () => {
  const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  const [status, setStatus] = useState<SlackStatus>({ connected: false });
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [channelsLoaded, setChannelsLoaded] = useState<boolean>(false);
  const [selectedChannel, setSelectedChannel] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [savingChannel, setSavingChannel] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/slack/status`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data: SlackStatus = await res.json();
        setStatus(data);
        if (data.channelId) {
          setSelectedChannel(data.channelId);
        }
        if (data.connected) {
          fetchChannels();
        }
      }
    } catch (err) {
      console.error('Failed to fetch Slack status:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchChannels = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/slack/channels`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        const fetchedChannels: SlackChannel[] = data.channels || [];
        setChannels(fetchedChannels);
        setChannelsLoaded(true);
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorMessage(errData.error || 'Failed to list Slack channels');
      }
    } catch (err) {
      console.error('Failed to fetch Slack channels:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleConnect = () => {
    window.location.href = `${backendUrl}/api/slack/connect`;
  };

  const handleDisconnect = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/slack/disconnect`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        setStatus({ connected: false });
        setChannels([]);
        setChannelsLoaded(false);
        setSelectedChannel('');
        setMessage('Slack disconnected successfully');
        setErrorMessage(null);
      }
    } catch (err) {
      console.error('Failed to disconnect Slack:', err);
    }
  };

  const handleSaveChannel = async (channelId: string) => {
    if (!channelId) return;
    setSavingChannel(true);
    setMessage(null);
    setErrorMessage(null);
    try {
      const res = await fetch(`${backendUrl}/api/slack/channel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ channelId }),
      });
      const data = await res.json();
      if (res.ok) {
        setSelectedChannel(channelId);
        const matchedChannel = channels.find((c) => c.id === channelId || c.name === channelId);
        const channelName = matchedChannel ? matchedChannel.name : data.channelId;
        setStatus((prev) => ({
          ...prev,
          channelId: data.channelId || channelId,
          channelName: channelName,
        }));
        setMessage(`Slack notification channel set to #${channelName.replace(/^#/, '')}`);
      } else {
        setErrorMessage(data.error || 'Failed to update Slack channel');
      }
    } catch (err: any) {
      console.error('Failed to update Slack channel:', err);
      setErrorMessage(err.message || 'Failed to update Slack channel');
    } finally {
      setSavingChannel(false);
    }
  };

  const getDisplayChannelName = (): string => {
    if (status.channelName) {
      return `#${status.channelName.replace(/^#/, '')}`;
    }
    if (status.channelId) {
      const matched = channels.find((c) => c.id === status.channelId);
      if (matched) {
        return `#${matched.name}`;
      }
      return `#${status.channelId.replace(/^#/, '')}`;
    }
    return 'No channel selected';
  };

  const isEmailAlertsAccessible = channels.some(
    (c) => c.name === 'email-alerts' || c.name === '#email-alerts'
  );

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <p className="text-slate-400 text-sm animate-pulse">Loading Slack status...</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            {/* Slack Hashtag Icon */}
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Slack Notifications</h3>
            <p className="text-slate-400 text-xs">
              Receive automated Slack alerts when hourly email rate limits are reached
            </p>
          </div>
        </div>

        <div>
          {status.connected ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Slack Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
              Disconnected
            </span>
          )}
        </div>
      </div>

      {message && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-emerald-300 text-xs">
          {message}
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-rose-300 text-xs flex items-start gap-2">
          <svg className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{errorMessage}</span>
        </div>
      )}

      {status.connected ? (
        <div className="space-y-4 pt-2 border-t border-slate-800">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-500 block mb-1">Slack Workspace Team</span>
              <span className="font-mono text-slate-300">{status.teamId || 'Default Workspace'}</span>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-500 block mb-1">Notification Channel</span>
              <span className="font-mono text-emerald-400 font-semibold">
                {getDisplayChannelName()}
              </span>
            </div>
          </div>

          {/* Channel Selection Flow */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-400">
              Select Slack Channel for Rate-Limit Notifications:
            </label>
            <select
              value={selectedChannel}
              onChange={(e) => handleSaveChannel(e.target.value)}
              disabled={savingChannel}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl p-3 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="">-- Choose a Slack Channel --</option>
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  #{ch.name}
                </option>
              ))}
            </select>

            {/* Accessibility error warning when #email-alerts is not in the channel list */}
            {channelsLoaded && !isEmailAlertsAccessible && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-amber-300 text-xs flex items-start gap-2 mt-2">
                <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>
                  Channel <strong>#email-alerts</strong> is not accessible to the Slack app. Please add the app to the <strong>#email-alerts</strong> channel in your Slack workspace.
                </span>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleDisconnect}
              className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold py-2 px-4 rounded-xl transition cursor-pointer"
            >
              Disconnect Slack
            </button>
          </div>
        </div>
      ) : (
        <div className="pt-2">
          <button
            onClick={handleConnect}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-2.5 px-5 rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
          >
            <span>Connect Slack</span>
          </button>
        </div>
      )}
    </div>
  );
};
