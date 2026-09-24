import React from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionText,
  onAction,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl text-center space-y-4 my-6">
      <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
      </div>

      <div className="space-y-1">
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <p className="text-slate-400 text-sm max-w-sm leading-relaxed">{description}</p>
      </div>

      {actionText && onAction && (
        <button
          onClick={onAction}
          className="mt-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2.5 px-5 rounded-xl transition shadow-lg shadow-indigo-600/20 cursor-pointer"
        >
          {actionText}
        </button>
      )}
    </div>
  );
};
