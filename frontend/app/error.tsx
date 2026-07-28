'use client';

import React from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-8 text-center bg-slate-900 text-white min-h-screen flex flex-col items-center justify-center">
      <h2 className="text-2xl font-bold text-red-500 mb-2">Something went wrong!</h2>
      <p className="text-slate-300 mb-4">{error?.message || 'An error occurred.'}</p>
      <button
        onClick={() => reset()}
        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-md transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
