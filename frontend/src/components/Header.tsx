import React from 'react';
import { NavLink } from 'react-router-dom';
import { UserProfile } from '../types';

interface HeaderProps {
  user: UserProfile;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user, onLogout }) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30 shadow-lg backdrop-blur-md bg-slate-900/90">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & App Name */}
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <span className="text-lg font-extrabold text-white tracking-tight">Email Scheduler</span>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1 text-sm font-medium">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `px-3.5 py-2 rounded-xl transition ${
                  isActive
                    ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`
              }
            >
              Dashboard
            </NavLink>

            <NavLink
              to="/scheduled"
              className={({ isActive }) =>
                `px-3.5 py-2 rounded-xl transition ${
                  isActive
                    ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`
              }
            >
              Scheduled Emails
            </NavLink>

            <NavLink
              to="/sent"
              className={({ isActive }) =>
                `px-3.5 py-2 rounded-xl transition ${
                  isActive
                    ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`
              }
            >
              Sent Emails
            </NavLink>

            <NavLink
              to="/queue"
              className={({ isActive }) =>
                `px-3.5 py-2 rounded-xl transition ${
                  isActive
                    ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`
              }
            >
              BullMQ Queue
            </NavLink>

            <NavLink
              to="/compose"
              className={({ isActive }) =>
                `px-3.5 py-2 rounded-xl transition ${
                  isActive
                    ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/20'
                    : 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-600/20'
                }`
              }
            >
              + Compose
            </NavLink>
          </nav>

          {/* User Profile & Logout */}
          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center space-x-3 text-right">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-9 h-9 rounded-full border border-indigo-500/30 object-cover"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center font-bold text-indigo-400 text-sm">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="text-xs">
                <div className="font-semibold text-white leading-tight">{user.name}</div>
                <div className="text-slate-400">{user.email}</div>
              </div>
            </div>

            <button
              onClick={onLogout}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold py-2 px-3.5 rounded-xl border border-slate-700 transition cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden flex items-center justify-around py-2 border-t border-slate-800 text-xs font-medium">
          <NavLink
            to="/"
            end
            className={({ isActive }) => (isActive ? 'text-indigo-400 font-bold' : 'text-slate-400')}
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/scheduled"
            className={({ isActive }) => (isActive ? 'text-indigo-400 font-bold' : 'text-slate-400')}
          >
            Scheduled
          </NavLink>
          <NavLink
            to="/sent"
            className={({ isActive }) => (isActive ? 'text-indigo-400 font-bold' : 'text-slate-400')}
          >
            Sent
          </NavLink>
          <NavLink
            to="/queue"
            className={({ isActive }) => (isActive ? 'text-indigo-400 font-bold' : 'text-slate-400')}
          >
            Queue
          </NavLink>
          <NavLink
            to="/compose"
            className={({ isActive }) => (isActive ? 'text-indigo-400 font-bold' : 'text-slate-400')}
          >
            Compose
          </NavLink>
        </div>
      </div>
    </header>
  );
};
