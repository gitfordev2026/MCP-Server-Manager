'use client';

import { useState, useRef, useEffect } from 'react';
import Navigation from '@/components/Navigation';
import MessageContent from '@/components/MessageContent';
import { publicEnv } from '@/lib/env';
import { authenticatedFetch } from '@/services/http';
import { streamAgentResponse } from '@/lib/agentStream';

const NEXT_PUBLIC_BE_API_URL = publicEnv.NEXT_PUBLIC_BE_API_URL


interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
        const defaultModel = typeof payload.default_model === 'string' ? payload.default_model : '';
        const initialModel = (defaultModel && modelList.includes(defaultModel))
          ? defaultModel
          : (modelList[0] || defaultModel || '');
        setModel(initialModel);
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
    if (!input.trim()) return;
    const prompt = input.trim();

    // Add user message
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
        url: `/api/proxy/agent/query/stream`,
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
    }
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
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className={`flex gap-3 max-w-xs sm:max-w-sm lg:max-w-xl`}>
                    {message.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/30">
                        <span className="text-white text-sm font-bold">AI</span>
                      </div>
                    )}
                    <div
                      className={`px-5 py-4 rounded-2xl transition-all duration-300 hover:scale-105 ${
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
                      <span className={`text-xs mt-2 block opacity-70 ${message.role === 'user' ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
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
                    <div className="bg-slate-100 text-slate-800 px-5 py-4 rounded-2xl rounded-bl-none border border-amber-300/50 shadow-md">
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
                  {models.length === 0 && !model && <option value="">No models found</option>}
                  {model && !models.includes(model) && (
                    <option value={model}>{model}</option>
                  )}
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
                    <span className="inline-block animate-spin-slow">⚙️</span>
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
