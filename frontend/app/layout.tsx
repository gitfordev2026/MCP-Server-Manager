import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { publicEnv } from '@/lib/env';
import AuthGuard from '@/components/AuthGuard';
import AppShell from '@/components/layout/AppShell';

void publicEnv;

export const metadata: Metadata = {
  title: "MCP Server Manager",
  description: "Enterprise MCP Server Management Platform — Register, discover, and orchestrate MCP tools and REST APIs with authentication, access control, and AI-powered interactions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>
          <AuthGuard>
            <AppShell>
              {children}
            </AppShell>
          </AuthGuard>
        </Providers>
      </body>
    </html>
  );
}
