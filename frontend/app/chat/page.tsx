'use client';

import React, { useState, useRef, useEffect } from 'react';
import Navigation from '@/components/Navigation';
import MessageContent from '@/components/MessageContent';
import { publicEnv } from '@/lib/env';
import { authenticatedFetch } from '@/services/http';
import { streamAgentResponse } from '@/lib/agentStream';

const NEXT_PUBLIC_BE_API_URL = publicEnv.NEXT_PUBLIC_BE_API_URL;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand
    }
  }
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
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

function buildHistory(messages: Message[]) {
  return messages
    .filter((message) => message.content.trim())
    .slice(-8)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hey there! 👋 I\'m your MCP Assistant. I\'m here to help you explore and manage your servers. Ask me anything about your MCP servers, and I\'ll provide you with detailed insights and support.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState('');
  const [modelError, setModelError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-focus input box whenever loading finishes or on mount
  useEffect(() => {
    if (!loading) {
      inputRef.current?.focus();
    }
  }, [loading]);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const response = await authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/agent/models`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.detail || `HTTP ${response.status}`);
        }
        const modelList = Array.isArray(payload.models) ? payload.models : [];
        setModels(modelList);
        setModel(payload.default_model || modelList[0] || '');
        setModelError(null);
      } catch (err) {
        console.error('Failed to load models:', err);
        setModelError(err instanceof Error ? err.message : 'Failed to load models');
      }
    };

    if (NEXT_PUBLIC_BE_API_URL) {
      void loadModels();
    }
  }, []);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const prompt = input.trim();

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: prompt,
      timestamp: new Date(),
    };
    const assistantMessageId = `${Date.now()}-assistant`;
    const assistantTimestamp = new Date();

    const nextMessages = [
      ...messages,
      userMessage,
      {
        id: assistantMessageId,
        role: 'assistant' as const,
        content: '',
        timestamp: assistantTimestamp,
      },
    ];

    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    try {
      if (!model) {
        throw new Error('No model selected. Please select a model and try again.');
      }
      await streamAgentResponse({
        url: `${NEXT_PUBLIC_BE_API_URL}/agent/query/stream`,
        body: {
          prompt,
          model,
          history: buildHistory(messages),
        },
        onMeta: (event) => {
          if (event.status === 'thinking') {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantMessageId && !message.content
                  ? { ...message, content: 'Thinking...' }
                  : message
              )
            );
          }
        },
        onChunk: (chunk) => {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    content: message.content === 'Thinking...' ? chunk : `${message.content}${chunk}`,
                  }
                : message
            )
          );
        },
      });
    } catch (error) {
      console.error('Error:', error);
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                content:
                  error instanceof Error
                    ? error.message
                    : 'Oops! I encountered an error. Please make sure the backend server is running.',
              }
            : message
        )
      );
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  // Regenerate Assistant response (strips assistant response and re-queries for prompt)
  const handleRegenerate = async (assistantMessageId: string) => {
    if (loading) return;
    const index = messages.findIndex((m) => m.id === assistantMessageId);
    if (index === -1) return;

    let userPrompt = '';
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        userPrompt = messages[i].content;
        break;
      }
    }

    if (!userPrompt) return;

    const slicedMessages = messages.slice(0, index);
    const newAssistantId = `${Date.now()}-assistant`;

    setMessages([
      ...slicedMessages,
      {
        id: newAssistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      },
    ]);
    setLoading(true);

    try {
      if (!model) throw new Error('No model selected. Please select a model.');
      await streamAgentResponse({
        url: `${NEXT_PUBLIC_BE_API_URL}/agent/query/stream`,
        body: {
          prompt: userPrompt,
          model,
          history: buildHistory(slicedMessages),
        },
        onMeta: (event) => {
          if (event.status === 'thinking') {
            setMessages((prev) =>
              prev.map((m) => (m.id === newAssistantId && !m.content ? { ...m, content: 'Thinking...' } : m))
            );
          }
        },
        onChunk: (chunk) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === newAssistantId
                ? { ...m, content: m.content === 'Thinking...' ? chunk : `${m.content}${chunk}` }
                : m
            )
          );
        },
      });
    } catch (error) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === newAssistantId
            ? { ...m, content: error instanceof Error ? error.message : 'Failed to regenerate response.' }
            : m
        )
      );
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  // Edit User message (loads text into input and strips message to allow editing)
  const handleEditUserMessage = (userMessageId: string, content: string) => {
    if (loading) return;
    const index = messages.findIndex((m) => m.id === userMessageId);
    if (index !== -1) {
      setMessages(messages.slice(0, index));
    }
    setInput(content);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // Resend User message directly
  const handleResendUserMessage = async (userMessageId: string, content: string) => {
    if (loading || !content.trim()) return;
    const index = messages.findIndex((m) => m.id === userMessageId);
    if (index === -1) return;

    const slicedMessages = messages.slice(0, index + 1);
    const newAssistantId = `${Date.now()}-assistant`;

    setMessages([
      ...slicedMessages,
      {
        id: newAssistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      },
    ]);
    setLoading(true);

    try {
      if (!model) throw new Error('No model selected. Please select a model.');
      await streamAgentResponse({
        url: `${NEXT_PUBLIC_BE_API_URL}/agent/query/stream`,
        body: {
          prompt: content,
          model,
          history: buildHistory(slicedMessages.slice(0, -1)),
        },
        onMeta: (event) => {
          if (event.status === 'thinking') {
            setMessages((prev) =>
              prev.map((m) => (m.id === newAssistantId && !m.content ? { ...m, content: 'Thinking...' } : m))
            );
          }
        },
        onChunk: (chunk) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === newAssistantId
                ? { ...m, content: m.content === 'Thinking...' ? chunk : `${m.content}${chunk}` }
                : m
            )
          );
        },
      });
    } catch (error) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === newAssistantId
            ? { ...m, content: error instanceof Error ? error.message : 'Failed to resend request.' }
            : m
        )
      );
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleCopyMessage = (id: string, text: string) => {
    copyToClipboard(text).then((success) => {
      if (success) {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col overflow-hidden transition-colors duration-200">
      {/* Navigation */}
      <Navigation pageTitle="Chat" />

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col pt-4 pb-6 relative z-10">
        <div className="max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 flex flex-col h-full">
          {/* Messages Container */}
          <div className="flex-1 bg-white dark:bg-slate-900 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col shadow-xs">
            <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
              {messages.map((message, index) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-slideInUp`}
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className={`flex gap-3 max-w-xs sm:max-w-md lg:max-w-2xl`}>
                    {message.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/30">
                        <span className="text-white text-sm font-bold">AI</span>
                      </div>
                    )}
                    <div className="flex flex-col">
                      <div
                        className={`px-5 py-4 rounded-2xl transition-all duration-300 ${
                          message.role === 'user'
                            ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-br-none shadow-lg shadow-blue-500/30'
                            : 'bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 rounded-bl-none border border-slate-200/90 dark:border-amber-500/30 shadow-xs dark:shadow-lg'
                        }`}
                      >
                        {message.content ? (
                          <div className="text-sm sm:text-base leading-relaxed font-medium">
                            <MessageContent content={message.content} />
                          </div>
                        ) : (
                          <div className="flex gap-2 py-1">
                            <div className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-bounce"></div>
                            <div className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                            <div className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                          </div>
                        )}
                        <span className={`text-[11px] mt-2 block opacity-75 ${message.role === 'user' ? 'text-blue-100 text-right' : 'text-slate-500 dark:text-slate-400'}`}>
                          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {/* Action Buttons Toolbar below each message */}
                      {message.role === 'assistant' ? (
                        <div className="flex items-center gap-2 mt-1.5 ml-1">
                          <button
                            type="button"
                            onClick={() => handleRegenerate(message.id)}
                            disabled={loading}
                            title="Strip this response & regenerate a new response"
                            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-white bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/80 border border-amber-200 dark:border-amber-800/60 px-2.5 py-1 rounded-lg transition-all cursor-pointer shadow-xs disabled:opacity-40"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Regenerate
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(message.id, message.content)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-lg transition-all cursor-pointer shadow-xs"
                          >
                            {copiedId === message.id ? '✓ Copied' : 'Copy'}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mt-1.5 justify-end mr-1">
                          <button
                            type="button"
                            onClick={() => handleEditUserMessage(message.id, message.content)}
                            disabled={loading}
                            title="Edit message in input box & strip response"
                            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-white bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/80 border border-blue-200 dark:border-blue-800/60 px-2.5 py-1 rounded-lg transition-all cursor-pointer shadow-xs disabled:opacity-40"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            Edit &amp; Resend
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResendUserMessage(message.id, message.content)}
                            disabled={loading}
                            title="Resend this message directly"
                            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-lg transition-all cursor-pointer shadow-xs disabled:opacity-40"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                            Resend
                          </button>
                        </div>
                      )}
                    </div>
                    {message.role === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-600 to-blue-700 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/30">
                        <span className="text-white text-sm font-bold">U</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && messages[messages.length - 1]?.role !== 'assistant' && (
                <div className="flex justify-start animate-slideInLeft">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 flex items-center justify-center shrink-0 shadow-lg shadow-amber-400/40">
                      <span className="text-white text-sm font-bold">AI</span>
                    </div>
                    <div className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-5 py-4 rounded-2xl rounded-bl-none border border-amber-300/50 shadow-md">
                      <div className="flex gap-2">
                        <div className="w-3 h-3 bg-amber-500 rounded-full animate-bounce"></div>
                        <div className="w-3 h-3 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        <div className="w-3 h-3 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 backdrop-blur-xl p-4 sm:p-6 space-y-3">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Model</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="min-w-[220px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  {models.length === 0 && <option value="">No models found</option>}
                  {models.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                {modelError && (
                  <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">{modelError}</span>
                )}
              </div>
              <form onSubmit={handleSendMessage} className="flex gap-3">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your message here..."
                  className="flex-1 px-5 py-3 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/40 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 transition-all duration-200"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="cursor-pointer bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white px-6 sm:px-8 py-3 rounded-2xl font-bold disabled:opacity-50 transition-all duration-300 hover:shadow-lg hover:shadow-amber-400/50 hover:scale-105 shadow-md active:scale-95"
                >
                  {loading ? (
                    <span className="inline-block animate-spin">⚙️</span>
                  ) : (
                    '✨ Send'
                  )}
                </button>
              </form>
              <p className="text-xs text-slate-500 mt-3">
                ✅ Connected • Powered by MCP Agent
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
