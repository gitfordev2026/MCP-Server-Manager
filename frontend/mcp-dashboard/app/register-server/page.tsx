'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Navigation from '@/components/Navigation';
import { publicEnv } from '@/lib/env';


const NEXT_PUBLIC_BE_API_URL = publicEnv.NEXT_PUBLIC_BE_API_URL


interface Server {
  name: string;
  url: string;
}

function isValidIpAddress(hostname: string): boolean {
  const ipv4Pattern =
    /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  if (ipv4Pattern.test(hostname)) return true;

  // Minimal IPv6 allowance for local parsing only; backend performs authoritative validation.
  return hostname.includes(':');
}

function validateServerUrlInput(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return 'Enter a valid URL (example: http://10.0.0.5:8005/mcp)';
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return 'URL must start with http:// or https://';
  }

  if (!parsed.port) {
    return 'URL must include an explicit port (example: :8005)';
  }

  const hostname = parsed.hostname;
  const isLocalhost = hostname === 'localhost';
  const isFqdn = hostname.includes('.');
  const isIp = isValidIpAddress(hostname);

  if (!isLocalhost && !isFqdn && !isIp) {
    return 'Host must be a valid IP, localhost, or a full domain (example: api.example.com)';
  }

  return null;
}

function toErrorMessage(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  if (Array.isArray(value)) {
    return value.map((item) => toErrorMessage(item)).join(', ');
  }
  if (value && typeof value === 'object') {
    const detail = (value as { detail?: unknown }).detail;
    const msg = (value as { msg?: unknown }).msg;
    if (typeof detail === 'string') return detail;
    if (typeof msg === 'string') return msg;
    try {
      return JSON.stringify(value);
    } catch {
      return 'An unexpected error occurred';
    }
  }
  return 'An unexpected error occurred';
}

export default function RegisterServerPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [servers, setServers] = useState<Server[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    url: '',
  });

  useEffect(() => {
    fetchServers();
  }, []);

  const fetchServers = async () => {
    try {
      const response = await fetch(`${NEXT_PUBLIC_BE_API_URL}/servers`);
      const data = await response.json();
      setServers(data.servers || []);
    } catch (err) {
      console.error('Failed to fetch servers:', err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const urlValidationError = validateServerUrlInput(formData.url);
      if (urlValidationError) {
        setError(urlValidationError);
        setLoading(false);
        return;
      }

      const response = await fetch(`${NEXT_PUBLIC_BE_API_URL}/register-server`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          (data && typeof data === 'object' && 'detail' in data && toErrorMessage((data as { detail: unknown }).detail)) ||
          (data && typeof data === 'object' && 'error' in data && toErrorMessage((data as { error: unknown }).error)) ||
          `Registration failed (${response.status})`;
        setError(`Registration failed: ${message}`);
        setLoading(false);
        return;
      }

      setSuccess(true);
      setFormData({ name: '', url: '' });
      await fetchServers();

      setTimeout(() => {
        setSuccess(false);
      }, 3000);

      setLoading(false);
    } catch (err) {
      setError(toErrorMessage(err));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-slate-50 to-slate-100 overflow-hidden">
      {/* Elegant background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-80 h-80 bg-emerald-400/8 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-20 right-10 w-80 h-80 bg-amber-400/8 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-blue-400/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Navigation */}
      <Navigation pageTitle="Register Server" />

      {/* Main Content */}
      <main className="pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto relative z-10">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Registration Form */}
          <div className="animate-slideInUp">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-500 bg-clip-text text-transparent mb-2">Register New Server</h2>
            <p className="text-slate-600 mb-6">Add a new MCP server to your hub</p>

            {success && (
              <div className="mb-4 p-4 bg-emerald-100 border border-emerald-400 rounded-lg text-emerald-700 animate-slideInUp">
                ✓ Server registered successfully!
              </div>
            )}

            {error && (
              <div className="mb-4 p-4 bg-amber-100 border border-amber-400 rounded-lg text-amber-700 animate-slideInUp">
                ✗ {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-emerald-700 mb-2">Server Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g., Browser MCP"
                  required
                  className="w-full px-4 py-2 bg-white border border-amber-300/50 rounded-xl text-slate-800 placeholder-slate-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-emerald-700 mb-2">Server URL</label>
                <input
                  type="url"
                  name="url"
                  value={formData.url}
                  onChange={handleChange}
                  placeholder="http://11.0.25.132:8005/mcp"
                  required
                  className="w-full px-4 py-2 bg-white border border-amber-300/50 rounded-xl text-slate-800 placeholder-slate-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition"
                />
              </div>

              <Button
                type="submit"
                className="cursor-pointer w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold py-2 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-emerald-400/50 hover:scale-105 shadow-md"
              >
                {loading ? '⏳ Registering...' : '✓ Register Server'}
              </Button>
            </form>

            <div className="mt-8 bg-white/70 backdrop-blur-xl border border-emerald-300/50 rounded-2xl p-6 shadow-lg shadow-emerald-200/30">
              <h3 className="text-sm font-semibold text-emerald-700 mb-3">📋 Server Format Example</h3>
              <div className="space-y-2 text-xs text-slate-600">
                <div>
                  <span className="text-amber-600">Name:</span> <span className="text-slate-700">Browser MCP</span>
                </div>
                <div>
                  <span className="text-amber-600">URL:</span> <span className="text-slate-700">http://11.0.25.132:8005/mcp</span>
                </div>
              </div>
            </div>
          </div>

          {/* Registered Servers List */}
          <div className="animate-slideInUp" style={{ animationDelay: '0.2s' }}>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent mb-2">Registered Servers</h2>
            <p className="text-slate-600 mb-6">Click on any server to explore its API endpoints</p>

            {servers.length === 0 ? (
              <div className="bg-white/70 backdrop-blur-xl border border-blue-300/50 rounded-2xl p-8 text-center shadow-lg shadow-blue-200/30">
                <p className="text-slate-600">No servers registered yet</p>
                <p className="text-slate-500 text-sm mt-2">Register your first server using the form on the left</p>
              </div>
            ) : (
              <div className="space-y-3">
                {servers.map((server, index) => (
                  // <Link key={index} href={`/api-explorer?url=${encodeURIComponent(server.url)}&name=${encodeURIComponent(server.name)}`}>
                  <Link key={index} href={`/servers/${encodeURIComponent(server.name)}`}>
                    <div className="group relative bg-white/70 hover:bg-white/80 border border-blue-300/50 hover:border-blue-500/60 transition-all duration-300 cursor-pointer rounded-2xl p-4 backdrop-blur-xl animate-slideInUp shadow-md hover:shadow-lg hover:shadow-blue-300/40" style={{ animationDelay: `${0.3 + index * 0.1}s` }}>
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-emerald-600 rounded-2xl blur-lg opacity-0 group-hover:opacity-20 transition-opacity duration-500"></div>
                      <div className="relative flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-slate-800 text-lg">{server.name}</h3>
                          <p className="text-slate-600 text-sm mt-1 break-all">{server.url}</p>
                        </div>
                        <span className="text-blue-600 ml-4 font-bold">→</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

