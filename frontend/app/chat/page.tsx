'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Navigation from '@/components/Navigation';
import { publicEnv } from '@/lib/env';

const NEXT_PUBLIC_BE_API_URL = publicEnv.NEXT_PUBLIC_BE_API_URL


interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // Send to backend API
      const response = await fetch(`${NEXT_PUBLIC_BE_API_URL}/agent/query?prompt=${encodeURIComponent(input)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      // Add assistant response
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response || 'I couldn\'t process your request. Please try again.',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Oops! I encountered an error. Please make sure the backend server is running.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-slate-50 to-slate-100 flex flex-col overflow-hidden">
      {/* Elegant background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-80 h-80 bg-amber-400/8 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-20 right-10 w-80 h-80 bg-blue-400/8 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-emerald-400/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Navigation */}
      <Navigation pageTitle="Chat" />

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col pt-24 pb-4 relative z-10">
        <div className="max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 flex flex-col h-full">
          {/* Messages Container */}
          <div className="flex-1 bg-white/70 backdrop-blur-xl border border-amber-300/50 rounded-2xl overflow-hidden flex flex-col shadow-lg shadow-amber-200/30">
            <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
              {messages.map((message, index) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-slideInUp`}
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className={`flex gap-3 max-w-xs sm:max-w-sm lg:max-w-xl`}>
                    {message.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-amber-500/30">
                        <span className="text-white text-sm font-bold">AI</span>
                      </div>
                    )}
                    <div
                      className={`px-5 py-4 rounded-2xl transition-all duration-300 hover:scale-105 ${
                        message.role === 'user'
                          ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-br-none shadow-lg shadow-blue-500/30'
                          : 'bg-slate-800/70 text-slate-100 rounded-bl-none border border-amber-500/30 shadow-lg'
                      }`}
                    >
                      <p className="text-sm sm:text-base leading-relaxed font-medium">{message.content}</p>
                      <span className={`text-xs mt-2 block opacity-70 ${message.role === 'user' ? 'text-blue-100' : 'text-slate-400'}`}>
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {message.role === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/30">
                        <span className="text-white text-sm font-bold">U</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start animate-slideInLeft">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-amber-400/40">
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
            <div className="border-t border-amber-300/50 bg-white/70 backdrop-blur-xl p-4 sm:p-6 shadow-lg">
              <form onSubmit={handleSendMessage} className="flex gap-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your message here..."
                  className="flex-1 px-5 py-3 border border-amber-300/50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white text-slate-800 placeholder-slate-400 transition-all duration-300 hover:border-amber-400/70"
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

