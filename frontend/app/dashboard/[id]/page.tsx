'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import Navigation from '@/components/Navigation';
import Card from '@/components/ui/Card';

export default function DashboardDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-slate-50 to-slate-100 overflow-hidden">
      <Navigation pageTitle="Dashboard Item" />
      <main className="pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        <Card className="bg-white/70 backdrop-blur-xl border border-slate-200/60 p-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Legacy Route</h1>
          <p className="text-slate-600 mb-6">
            The route <code>/dashboard/{id}</code> is currently not connected to an active API.
          </p>
          <Link
            href="/dashboard"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Back to Dashboard
          </Link>
        </Card>
      </main>
    </div>
  );
}
