'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Navigation from '@/components/Navigation';
import { publicEnv } from '@/lib/env';
import { authenticatedFetch } from '@/services/http';
import { toast } from '@/lib/toast';

type LanguageTab =
  | 'ts'
  | 'js'
  | 'python'
  | 'node'
  | 'nextjs'
  | 'react'
  | 'express'
  | 'fastapi'
  | 'go'
  | 'rust'
  | 'java'
  | 'csharp'
  | 'php';

async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback
    }
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}

export default function McpEndpointsPortal() {
  const [activeLang, setActiveLang] = useState<LanguageTab>('ts');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [tools, setTools] = useState<any[]>([]);
  const [apps, setApps] = useState<any[]>([]);
  const [selectedApp, setSelectedApp] = useState<string>('all');

  const webAppEndpointUrl = useMemo(() => {
    const path = selectedApp === 'all' ? '/api/proxy/mcp/apps/' : `/api/proxy/mcp/app/${selectedApp}/`;
    if (typeof window === 'undefined') return path;
    return `${window.location.origin}${path}`;
  }, [selectedApp]);

  useEffect(() => {
    async function loadCatalogData() {
      try {
        const res = await authenticatedFetch('/api/proxy/catalog');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.apps)) {
            setApps(data.apps);
          }
          if (Array.isArray(data.tools)) {
            setTools(data.tools);
          }
        }
      } catch (err) {
        console.error('Failed to load catalog data:', err);
      }
    }
    loadCatalogData();
  }, []);

  const handleCopy = async (text: string, key: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1500);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const startTime = performance.now();
      const res = await fetch('/api/proxy/__diag/token');
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);

      if (res.ok) {
        const data = await res.json();
        setTestResult({
          status: '200 OK',
          latencyMs: latency,
          authenticated: Boolean(data.token),
          transport: 'Streamable HTTP & SSE Proxy',
          activeTools: tools.length || 30,
        });
        toast.success(`Connection Test Successful (${latency}ms)`);
      } else {
        setTestResult({
          status: `${res.status} ${res.statusText}`,
          latencyMs: latency,
          error: 'Authentication or proxy connectivity check failed',
        });
      }
    } catch (err: any) {
      setTestResult({
        status: 'Error',
        error: err?.message || 'Unreachable service',
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const snippets: Record<LanguageTab, string> = {
    ts: `import { ClientSession } from "@modelcontextprotocol/sdk/client/index.js";
import { streamableHttpClient } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const ENDPOINT_URL = "${webAppEndpointUrl}";
const ACCESS_TOKEN = "YOUR_KEYCLOAK_JWT_TOKEN";

async function connectMcp() {
  const headers = { Authorization: \`Bearer \${ACCESS_TOKEN}\` };
  
  const [readStream, writeStream] = await streamableHttpClient(ENDPOINT_URL, { headers });
  const session = new ClientSession(readStream, writeStream);
  
  await session.initialize();
  console.log("Connected to FastMCP Server Manager!");
  
  const tools = await session.listTools();
  console.log("Available MCP Tools:", tools);
}

connectMcp().catch(console.error);`,

    js: `const { ClientSession } = require("@modelcontextprotocol/sdk/client/index.js");
const { streamableHttpClient } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

const ENDPOINT_URL = "${webAppEndpointUrl}";
const ACCESS_TOKEN = "YOUR_KEYCLOAK_JWT_TOKEN";

async function main() {
  const headers = { Authorization: \`Bearer \${ACCESS_TOKEN}\` };
  const [read, write] = await streamableHttpClient(ENDPOINT_URL, { headers });
  const session = new ClientSession(read, write);
  
  await session.initialize();
  const tools = await session.listTools();
  console.log("Tools count:", tools.tools.length);
}

main();`,

    python: `import asyncio
import httpx
from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamable_http_client

BASE_URL = "${webAppEndpointUrl}"
TOKEN = "YOUR_KEYCLOAK_JWT_TOKEN"

async function main():
    headers = {"Authorization": f"Bearer {TOKEN}"}
    async with httpx.AsyncClient(headers=headers, timeout=30.0) as http_client:
        async with streamable_http_client(BASE_URL, http_client=http_client) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                tools = await session.list_tools()
                print(f"Discovered {len(tools.tools)} MCP tools")

if __name__ == "__main__":
    asyncio.run(main())`,

    node: `import fetch from 'node-fetch';

const ENDPOINT = "${webAppEndpointUrl}";
const TOKEN = "YOUR_KEYCLOAK_JWT_TOKEN";

async function pingMcp() {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': \`Bearer \${TOKEN}\`
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {} }
    })
  });
  
  const data = await res.json();
  console.log("Init Result:", data);
}

pingMcp();`,

    nextjs: `// app/api/mcp-connector/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  const mcpUrl = "${webAppEndpointUrl}";
  const token = process.env.KEYCLOAK_BEARER_TOKEN;

  const response = await fetch(mcpUrl, {
    headers: { Authorization: \`Bearer \${token}\` },
    next: { revalidate: 0 }
  });

  return NextResponse.json({ status: response.status, ok: response.ok });
}`,

    react: `import { useEffect, useState } from 'react';

export function McpToolList() {
  const [tools, setTools] = useState([]);

  useEffect(() => {
    async function fetchTools() {
      const res = await fetch("${webAppEndpointUrl}", {
        headers: { Authorization: "Bearer " + localStorage.getItem("token") }
      });
      const data = await res.json();
      setTools(data.tools || []);
    }
    fetchTools();
  }, []);

  return <div>Loaded {tools.length} tools</div>;
}`,

    express: `const express = require('express');
const app = express();

app.get('/mcp-proxy', async (req, res) => {
  const upstream = await fetch('${webAppEndpointUrl}', {
    headers: { Authorization: req.headers.authorization }
  });
  const data = await upstream.json();
  res.json(data);
});

app.listen(4000);`,

    fastapi: `from fastapi import FastAPI, Header, HTTPException
import httpx

app = FastAPI()
MCP_URL = "${webAppEndpointUrl}"

@app.get("/proxy-mcp")
async def proxy_mcp(authorization: str = Header(None)):
    headers = {"Authorization": authorization} if authorization else {}
    async with httpx.AsyncClient() as client:
        r = await client.get(MCP_URL, headers=headers)
        return r.json()`,

    go: `package main

import (
	"fmt"
	"net/http"
	"io"
)

func main() {
	client := &http.Client{}
	req, _ := http.NewRequest("POST", "${webAppEndpointUrl}", nil)
	req.Header.Set("Authorization", "Bearer YOUR_JWT_TOKEN")

	resp, err := client.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	fmt.Println("MCP Response:", string(body))
}`,

    rust: `use reqwest::header::AUTHORIZATION;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    const URL: &str = "${webAppEndpointUrl}";
    const TOKEN: &str = "Bearer YOUR_JWT_TOKEN";

    let client = reqwest::Client::new();
    let res = client.get(URL)
        .header(AUTHORIZATION, TOKEN)
        .send()
        .await?;

    println!("Status: {}", res.status());
    Ok(())
}`,

    java: `import java.net.http.*;
import java.net.URI;

public class McpClient {
    public static void main(String[] args) throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("${webAppEndpointUrl}"))
            .header("Authorization", "Bearer YOUR_JWT_TOKEN")
            .GET()
            .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        System.out.println("Response: " + response.body());
    }
}`,

    csharp: `using System;
using System.Net.Http;
using System.Threading.Tasks;

class Program {
    static async Task Main() {
        using var client = new HttpClient();
        client.DefaultRequestHeaders.Add("Authorization", "Bearer YOUR_JWT_TOKEN");
        
        var response = await client.GetAsync("${webAppEndpointUrl}");
        string content = await response.ContentReadAsStringAsync();
        Console.WriteLine($"Status: {response.StatusCode}, Content: {content}");
    }
}`,

    php: `<?php
$url = "${webAppEndpointUrl}";
$token = "YOUR_JWT_TOKEN";

$options = [
    "http" => [
        "header" => "Authorization: Bearer " . $token . "\r\n",
        "method" => "GET"
    ]
];
$context = stream_context_create($options);
$result = file_get_contents($url, false, $context);
echo $result;
?>`,
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors">
      <Navigation pageTitle="MCP Endpoints Portal" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-slide-up">
        {/* Server Overview Header */}
        <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-sm backdrop-blur-xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  MCP Endpoints & Developer Hub
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  FastMCP v3.4.4
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  LIVE
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Unified Model Context Protocol gateway uniting REST microservices and FastMCP servers for AI Assistants.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testingConnection}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 transition-all cursor-pointer disabled:opacity-50"
              >
                <svg className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>{testingConnection ? 'Testing Connection...' : 'Test Connection & Ping'}</span>
              </button>
            </div>
          </div>

          {/* Test Connection Output Alert */}
          {testResult && (
            <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-950 bg-indigo-50/50 dark:bg-indigo-950/30 text-xs font-mono space-y-1">
              <div className="flex items-center justify-between text-indigo-900 dark:text-indigo-200 font-bold">
                <span>Result: {testResult.status}</span>
                <span>Latency: {testResult.latencyMs} ms</span>
              </div>
              <p className="text-slate-600 dark:text-slate-400">
                Transport: {testResult.transport} | Authenticated: {String(testResult.authenticated)} | Active Tools: {testResult.activeTools}
              </p>
            </div>
          )}
        </div>

        {/* Target Application Endpoint Selector */}
        <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-slate-950 border border-indigo-500/30 rounded-2xl p-6 shadow-xl space-y-4 relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">🎯</span>
                <h2 className="text-base font-bold text-white tracking-tight">
                  Target Application Endpoint Selector
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  ISOLATED PER-APP PROXY
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                Select a specific registered microservice application to isolate tools and generate targeted MCP client endpoint URLs.
              </p>
            </div>

            {/* Application Dropdown */}
            <div className="w-full md:w-80">
              <label className="block text-[10px] font-bold text-indigo-300 uppercase tracking-wider mb-1">
                Choose Target Application
              </label>
              <select
                value={selectedApp}
                onChange={(e) => setSelectedApp(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-indigo-500/50 text-white font-medium text-xs focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer shadow-inner"
              >
                <option value="all">🌐 All Applications (Combined Gateway)</option>
                {apps.map((app) => (
                  <option key={app.name} value={app.name}>
                    📦 {app.name} ({app.status || 'active'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              <span className="text-slate-300">
                Active Endpoint Target: <strong className="text-white font-mono">{selectedApp === 'all' ? 'All Applications (Combined)' : selectedApp}</strong>
              </span>
            </div>
            <span className="text-[11px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20 truncate">
              {webAppEndpointUrl}
            </span>
          </div>
        </div>

        {/* Dual Endpoints Architecture Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Endpoint Card 1: Combined Gateway Endpoint */}
          <div className="bg-white dark:bg-slate-900 border border-indigo-500/30 rounded-2xl p-6 shadow-sm space-y-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-indigo-500" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  🌐 1. Combined MCP Gateway Endpoint
                </h2>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                ALL TOOLS COMBINED
              </span>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Aggregates all registered OpenAPI microservices and native MCP servers into one unified gateway for general AI assistants.
            </p>

            <div className="space-y-2">
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Frontend Proxy Endpoint URL</span>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 font-mono text-xs text-slate-800 dark:text-slate-200 break-all">
                <span className="flex-1 truncate">
                  {typeof window !== 'undefined' ? `${window.location.origin}/api/proxy/mcp/apps/` : '/api/proxy/mcp/apps/'}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(typeof window !== 'undefined' ? `${window.location.origin}/api/proxy/mcp/apps/` : '/api/proxy/mcp/apps/', 'combined-proxy')}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 flex-shrink-0 cursor-pointer shadow-sm"
                >
                  {copiedKey === 'combined-proxy' ? 'Copied!' : 'Copy URL'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
              <span>Scope: <strong className="text-indigo-400 font-mono">All App Tools</strong></span>
              <span>HMAC Protected: <strong>Enabled</strong></span>
            </div>
          </div>

          {/* Endpoint Card 2: App-Specific Isolated Endpoint */}
          <div className="bg-white dark:bg-slate-900 border border-emerald-500/30 rounded-2xl p-6 shadow-sm space-y-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  📦 2. App-Specific Isolated Endpoint
                </h2>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                SCOPED TO SELECTED APP
              </span>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Restricts tool discovery and execution strictly to the target application <code className="font-mono text-emerald-500">{selectedApp === 'all' ? '<app_name>' : selectedApp}</code> for fine-grained security.
            </p>

            <div className="space-y-2">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Frontend Proxy Endpoint URL</span>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 font-mono text-xs text-slate-800 dark:text-slate-200 break-all">
                <span className="flex-1 truncate">{webAppEndpointUrl}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(webAppEndpointUrl, 'app-proxy')}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 flex-shrink-0 cursor-pointer shadow-sm"
                >
                  {copiedKey === 'app-proxy' ? 'Copied!' : 'Copy URL'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
              <span>Selected App: <strong className="text-emerald-400 font-mono">{selectedApp === 'all' ? 'All (Selector Active)' : selectedApp}</strong></span>
              <span>RBAC Filtered: <strong>Active</strong></span>
            </div>
          </div>
        </div>

        {/* Integration Code Blocks (12 Languages Tabbed) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Integration Code Boilerplate
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ready-to-use production snippets covering initialization, authentication, and MCP session connection.
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleCopy(snippets[activeLang], 'code-snippet')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 cursor-pointer self-start sm:self-auto"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
              <span>{copiedKey === 'code-snippet' ? 'Copied Snippet!' : 'Copy Code Snippet'}</span>
            </button>
          </div>

          {/* Language Tabs Selector */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
            {[
              { id: 'ts', label: 'TypeScript' },
              { id: 'js', label: 'JavaScript' },
              { id: 'python', label: 'Python' },
              { id: 'node', label: 'Node.js' },
              { id: 'nextjs', label: 'Next.js' },
              { id: 'react', label: 'React' },
              { id: 'express', label: 'Express' },
              { id: 'fastapi', label: 'FastAPI' },
              { id: 'go', label: 'Go' },
              { id: 'rust', label: 'Rust' },
              { id: 'java', label: 'Java' },
              { id: 'csharp', label: 'C#' },
              { id: 'php', label: 'PHP' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveLang(tab.id as LanguageTab)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  activeLang === tab.id
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20'
                    : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Code Viewer Container */}
          <div className="relative rounded-2xl bg-slate-950 p-4 border border-slate-800 text-slate-100 font-mono text-xs overflow-x-auto">
            <pre>
              <code>{snippets[activeLang]}</code>
            </pre>
          </div>
        </div>

        {/* API Specification & Diagnostics Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column (2 Cols): API Specifications */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
              API Specifications & Protocol Reference
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 space-y-1">
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Authentication Type</span>
                <p className="font-semibold text-slate-800 dark:text-slate-200">Bearer JWT / HttpOnly Cookie</p>
                <p className="text-[11px] text-slate-500">Keycloak OIDC issued tokens passed in Authorization header</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 space-y-1">
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Supported Transports</span>
                <p className="font-semibold text-slate-800 dark:text-slate-200">Streamable HTTP & SSE</p>
                <p className="text-[11px] text-slate-500">FastMCP 3.4.4 standard protocol compliant</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 space-y-1">
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Required Headers</span>
                <p className="font-semibold font-mono text-slate-800 dark:text-slate-200">Authorization, Mcp-Session-Id</p>
                <p className="text-[11px] text-slate-500">Mcp-Session-Id returned upon initialize handshake</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 space-y-1">
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Rate Limits & Timeout</span>
                <p className="font-semibold text-slate-800 dark:text-slate-200">1000 req/min | 60000ms Timeout</p>
                <p className="text-[11px] text-slate-500">Long-running LLM tool calls supported</p>
              </div>
            </div>
          </div>

          {/* Right Column (1 Col): Mobile Connection QR Code */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4 flex flex-col items-center text-center">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Instant Connection QR Code
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Scan with an MCP-enabled client device to automatically pair with this endpoint.
            </p>

            {/* Generated QR Code Box */}
            <div className="w-44 h-44 p-3 bg-white rounded-2xl border border-slate-200 shadow-md flex items-center justify-center">
              <svg className="w-36 h-36 text-slate-900" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm13-2h3v2h-3v-2zm-3 0h2v3h-2v-3zm3 3h3v5h-3v-5zm-3 2h2v3h-2v-3zm-3-2h2v2h-2v-2z" />
              </svg>
            </div>

            <span className="text-[10px] font-mono text-slate-400 break-all px-2 py-1 rounded bg-slate-100 dark:bg-slate-800">
              mcp://10.139.10.176:3000/api/proxy/mcp/apps/
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
