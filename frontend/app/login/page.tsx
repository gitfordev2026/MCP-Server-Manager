'use client';

import Link from 'next/link';
import Navigation from '@/components/Navigation';
import Card from '@/components/ui/Card';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-slate-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 overflow-hidden">
      <Navigation pageTitle="Login" />
      <main className="pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-md mx-auto">
        <Card className="bg-white dark:bg-slate-900/70 backdrop-blur-xl border border-slate-200 dark:border-slate-700/60 p-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">Login Placeholder</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Login UI is not implemented yet. Use registration flow or return to dashboard.
          </p>
          <Link
            href="/"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Go to Dashboard
          </Link>
        </Card>
      </main>
    </div>
  );
}
