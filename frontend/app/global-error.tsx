'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: '40px', fontFamily: 'sans-serif', backgroundColor: '#0f172a', color: '#ffffff', textAlign: 'center' }}>
        <h2 style={{ color: '#ef4444' }}>Application Error</h2>
        <p style={{ color: '#94a3b8' }}>{error?.message || 'An unexpected error occurred.'}</p>
        <button
          onClick={() => reset()}
          style={{
            padding: '10px 20px',
            backgroundColor: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
