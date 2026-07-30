'use client';

import React, { useState } from 'react';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { CopyButton } from '@/components/shared/CopyButton';

interface CodeExamplesProps {
  serverName: string;
  backendUrl: string;
  webappUrl: string;
}

export function CodeExamples({ serverName, backendUrl, webappUrl }: CodeExamplesProps) {
  const [activeLang, setActiveLang] = useState('typescript');
  const [activeUrlType, setActiveUrlType] = useState<'backend' | 'webapp'>('backend');

  const currentUrl = activeUrlType === 'backend' ? backendUrl : webappUrl;

  const languages = [
    { id: 'typescript', label: 'TypeScript' },
    { id: 'javascript', label: 'JavaScript' },
    { id: 'python', label: 'Python' },
    { id: 'nodejs', label: 'Node.js' },
    { id: 'nextjs', label: 'Next.js' },
    { id: 'react', label: 'React' },
    { id: 'express', label: 'Express' },
    { id: 'fastapi', label: 'FastAPI' },
    { id: 'go', label: 'Go' },
    { id: 'rust', label: 'Rust' },
    { id: 'java', label: 'Java' },
    { id: 'csharp', label: 'C# (.NET)' },
    { id: 'php', label: 'PHP' },
  ];

  const getCodeSnippet = (lang: string, url: string) => {
    switch (lang) {
      case 'typescript':
        return `import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function connectToMCP() {
  const transport = new StreamableHTTPTransport("${url}");
  const client = new Client(
    { name: "mcp-client", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log("Connected to MCP Server: ${serverName}");

  const tools = await client.listTools();
  console.log("Available tools:", tools);
}

connectToMCP().catch(console.error);`;

      case 'javascript':
        return `const { Client } = require("@modelcontextprotocol/sdk/client");
const { StreamableHTTPTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp");

async function main() {
  const transport = new StreamableHTTPTransport("${url}");
  const client = new Client({ name: "js-app", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);

  const result = await client.callTool({
    name: "${serverName}__health_health_get",
    arguments: {}
  });
  console.log("Tool Result:", result);
}

main();`;

      case 'python':
        return `import asyncio
from mcp import ClientSession, StreamableHTTPTransport

async function main():
    async with StreamableHTTPTransport("${url}") as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            print("Connected to ${serverName}")

            tools = await session.list_tools()
            print(f"Discovered {len(tools.tools)} tools")

asyncio.run(main())`;

      case 'nodejs':
        return `import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const transport = new SSEClientTransport(new URL("${url}"));
const client = new Client({ name: "node-service", version: "1.0.0" }, { capabilities: {} });

await client.connect(transport);
console.log("Connected via Node.js SSE");`;

      case 'nextjs':
        return `// app/api/mcp/route.ts (Next.js Server Action / API Route)
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const token = request.headers.get('authorization');
  const response = await fetch('${url}', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': token } : {})
    },
    body: JSON.stringify(await request.json())
  });

  return NextResponse.json(await response.json());
}`;

      case 'react':
        return `import { useEffect, useState } from 'react';

export function MCPToolStatus() {
  const [status, setStatus] = useState('connecting');

  useEffect(() => {
    fetch('${url}')
      .then(res => res.ok ? setStatus('connected') : setStatus('error'))
      .catch(() => setStatus('offline'));
  }, []);

  return <div className="badge">MCP Endpoint: {status}</div>;
}`;

      case 'express':
        return `const express = require('express');
const axios = require('axios');
const app = express();

app.post('/api/mcp-proxy', async (req, res) => {
  try {
    const response = await axios.post('${url}', req.body, {
      headers: { 'Authorization': req.headers.authorization }
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001);`;

      case 'fastapi':
        return `from fastapi import FastAPI, Header, HTTPException
import httpx

app = FastAPI()

MCP_ENDPOINT = "${url}"

@app.post("/mcp-proxy")
async def proxy_mcp(payload: dict, authorization: str = Header(None)):
    headers = {"Authorization": authorization} if authorization else {}
    async with httpx.AsyncClient() as client:
        res = await client.post(MCP_ENDPOINT, json=payload, headers=headers)
        return res.json()`;

      case 'go':
        return `package main

import (
	"fmt"
	"net/http"
	"io/ioutil"
	"bytes"
)

func main() {
	url := "${url}"
	jsonReq := []byte(\`{"jsonrpc":"2.0","method":"tools/list","id":1}\`)

	req, _ := http.NewRequest("POST", url, bytes.NewBuffer(jsonReq))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	body, _ := ioutil.ReadAll(resp.Body)
	fmt.Println("MCP Response:", string(body))
}`;

      case 'rust':
        return `use reqwest::header::CONTENT_TYPE;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();
    let res = client.post("${url}")
        .header(CONTENT_TYPE, "application/json")
        .body(r#"{"jsonrpc":"2.0","method":"tools/list","id":1}"#)
        .send()
        .await?;

    println!("Status: {}", res.status());
    println!("Response: {}", res.text().await?);
    Ok(())
}`;

      case 'java':
        return `import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public class MCPClient {
    public static void main(String[] args) throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("${url}"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\\"jsonrpc\\":\\"2.0\\",\\"method\\":\\"tools/list\\",\\"id\\":1}"))
                .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        System.out.println("MCP Response: " + response.body());
    }
}`;

      case 'csharp':
        return `using System;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;

class Program {
    static async Task Main() {
        using var client = new HttpClient();
        var content = new StringContent("{\\"jsonrpc\\":\\"2.0\\",\\"method\\":\\"tools/list\\",\\"id\\":1}", Encoding.UTF8, "application/json");
        var response = await client.PostAsync("${url}", content);
        var result = await response.Content.ReadAsStringAsync();
        Console.WriteLine($"MCP Result: {result}");
    }
}`;

      case 'php':
        return `<?php
$url = '${url}';
$data = array('jsonrpc' => '2.0', 'method' => 'tools/list', 'id' => 1);

$options = array(
    'http' => array(
        'header'  => "Content-type: application/json\r\n",
        'method'  => 'POST',
        'content' => json_encode($data)
    )
);
$context  = stream_context_create($options);
$result = file_get_contents($url, false, $context);
echo "MCP Response: " . $result;
?>`;

      default:
        return `// Endpoint: ${url}`;
    }
  };

  return (
    <div className="space-y-4">
      {/* Endpoint URL Switcher */}
      <div className="flex items-center justify-between gap-2 p-2 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[var(--text-secondary)] pl-2">Target Endpoint:</span>
          <button
            onClick={() => setActiveUrlType('backend')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              activeUrlType === 'backend'
                ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            🖥️ Backend Endpoint
          </button>
          <button
            onClick={() => setActiveUrlType('webapp')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              activeUrlType === 'webapp'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            🌐 Web App Endpoint
          </button>
        </div>

        <CopyButton text={currentUrl} size="sm" />
      </div>

      {/* Language Selector Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {languages.map((lang) => (
          <button
            key={lang.id}
            onClick={() => setActiveLang(lang.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
              activeLang === lang.id
                ? 'bg-[var(--bg-overlay)] text-[var(--text-primary)] font-semibold border border-[var(--border-strong)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
            }`}
          >
            {lang.label}
          </button>
        ))}
      </div>

      {/* Code Viewer */}
      <CodeBlock
        code={getCodeSnippet(activeLang, currentUrl)}
        language={activeLang === 'csharp' ? 'csharp' : activeLang}
        title={`${languages.find(l => l.id === activeLang)?.label} Connection Example`}
      />
    </div>
  );
}
