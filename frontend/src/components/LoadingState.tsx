import React from 'react';

interface LoadingStateProps {
  message?: string;
  count?: number;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading data...',
  count = 3,
}) => {
  return (
    <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-4 my-6">
      <div className="flex items-center space-x-3 text-slate-400 text-sm font-medium">
        <div className="w-5 h-5 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
        <span>{message}</span>
      </div>
      <div className="space-y-3 pt-2">
        {Array.from({ length: count }).map((_, idx) => (
          <div key={idx} className="h-10 bg-slate-800/50 rounded-xl animate-pulse w-full"></div>
        ))}
      </div>
    </div>
  );
};
