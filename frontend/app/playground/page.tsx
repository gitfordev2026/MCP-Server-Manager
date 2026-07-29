'use client';

import React, { useCallback, useEffect, useState, useRef } from 'react';
import MessageContent from '@/components/MessageContent';
import Navigation from '@/components/Navigation';
import { publicEnv } from '@/lib/env';
import { authenticatedFetch } from '@/services/http';
import { streamAgentResponse } from '@/lib/agentStream';

const NEXT_PUBLIC_BE_API_URL = publicEnv.NEXT_PUBLIC_BE_API_URL;

interface ServerItem {
    name: string;
    url: string;
}

interface CatalogTool {
    name: string;
    title: string;
    app: string;
    method: string;
    path: string;
}

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

interface PlaygroundPayload {
    prompt: string;
    app_name?: string;
    selected_tools?: string[];
    model?: string;
    history?: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>;
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
        .filter((message) => {
            const content = message.content.trim();
            if (!content) return false;
            if (message.role !== 'assistant') return true;
            if (content.startsWith('You are now testing')) return false;
            if (content.startsWith('Unknown tools requested:')) return false;
            if (content.startsWith('No tools available for the current selection.')) return false;
            return true;
        })
        .slice(-8)
        .map((message) => ({
            role: message.role,
            content: message.content,
        }));
}

export default function PlaygroundPage() {
    const [servers, setServers] = useState<ServerItem[]>([]);
    const [catalogTools, setCatalogTools] = useState<CatalogTool[]>([]);
    const [ollamaModels, setOllamaModels] = useState<string[]>([]);
    const [selectedModel, setSelectedModel] = useState<string>('');
    const [modelError, setModelError] = useState<string | null>(null);

    // Selection State
    const [selectedApp, setSelectedApp] = useState<string>('all');
    const [appTools, setAppTools] = useState<CatalogTool[]>([]);
    const [selectedToolNames, setSelectedToolNames] = useState<Set<string>>(new Set());
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editInput, setEditInput] = useState('');

    // Chat State
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            role: 'assistant',
            content: 'Welcome to the Playground! Please select an application to test its exposed tools.',
            timestamp: new Date(),
        },
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [chatLoading, setChatLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Auto-focus input box when chatLoading finishes or page mounts
    useEffect(() => {
        if (!chatLoading) {
            inputRef.current?.focus();
        }
    }, [chatLoading]);

    /* --- data fetching --- */
    const fetchData = useCallback(async () => {
        if (!NEXT_PUBLIC_BE_API_URL) {
            setError('Backend API URL is not configured (NEXT_PUBLIC_BE_API_URL)');
            setLoading(false);
            return;
        }
        try {
            setLoading(true);
            const [serversRes, catalogRes, modelsRes] = await Promise.allSettled([
                authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/servers`),
                authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/mcp/openapi/catalog?force_refresh=false&public_only=true`),
                authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/agent/models`),
            ]);

            if (serversRes.status === 'fulfilled' && serversRes.value.ok) {
                const payload = await serversRes.value.json();
                setServers(Array.isArray(payload?.servers) ? payload.servers : []);
            }

            if (catalogRes.status === 'fulfilled' && catalogRes.value.ok) {
                const payload = await catalogRes.value.json();
                setCatalogTools(Array.isArray(payload?.tools) ? payload.tools : []);
            }

            if (modelsRes.status === 'fulfilled' && modelsRes.value.ok) {
                const payload = await modelsRes.value.json();
                const models = Array.isArray(payload?.models) ? payload.models : [];
                setOllamaModels(models);
                const defaultModel = typeof payload?.default_model === 'string' ? payload.default_model : '';
                setSelectedModel((prev) => {
                    if (prev && (models.includes(prev) || prev === defaultModel)) return prev;
                    if (defaultModel && models.includes(defaultModel)) return defaultModel;
                    return models[0] || defaultModel || '';
                });
                setModelError(null);
            } else if (modelsRes.status === 'fulfilled' && !modelsRes.value.ok) {
                setModelError(`Failed to load models (${modelsRes.value.status})`);
            }
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleAppSelect = (appName: string) => {
        setSelectedApp(appName);
        if (appName === 'all') {
            setAppTools([]);
            setSelectedToolNames(new Set());
            setIsModalOpen(false);

            setMessages((prev) => [
                ...prev,
                {
                    id: Date.now().toString(),
                    role: 'assistant',
                    content: 'You are now testing **All Applications**. I will have access to every public tool available.',
                    timestamp: new Date(),
                },
            ]);
        } else {
            const toolsForApp = catalogTools.filter(t => t.app === appName);
            setAppTools(toolsForApp);
            setSelectedToolNames(new Set(toolsForApp.map(t => t.name)));
            setIsModalOpen(true);
        }
    };

    const toggleToolSelection = (toolName: string) => {
        setSelectedToolNames(prev => {
            const next = new Set(prev);
            if (next.has(toolName)) {
                next.delete(toolName);
            } else {
                next.add(toolName);
            }
            return next;
        });
    };

    const handleModalConfirm = () => {
        setIsModalOpen(false);
        setMessages((prev) => [
            ...prev,
            {
                id: Date.now().toString(),
                role: 'assistant',
                content: `You are now testing the application **${selectedApp}**. I am restricted to using only the ${selectedToolNames.size} tool(s) you selected.`,
                timestamp: new Date(),
            },
        ]);
        setTimeout(() => inputRef.current?.focus(), 100);
    };

    const submitMessage = async (promptText: string, currentMessages: Message[]) => {
        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: promptText,
            timestamp: new Date(),
        };
        const assistantMessageId = `${Date.now()}-assistant`;
        const assistantTimestamp = new Date();

        const nextMessages: Message[] = [
            ...currentMessages,
            userMessage,
            {
                id: assistantMessageId,
                role: 'assistant',
                content: '',
                timestamp: assistantTimestamp,
            },
        ];

        setMessages(nextMessages);
        setInput('');
        setChatLoading(true);

        try {
            const payload: PlaygroundPayload = {
                prompt: promptText,
                history: buildHistory(currentMessages),
            };

            if (selectedModel) {
                payload.model = selectedModel;
            }

            if (selectedApp !== 'all') {
                payload.app_name = selectedApp;
                payload.selected_tools = Array.from(selectedToolNames);
            }

            await streamAgentResponse({
                url: `/api/proxy/agent/playground/query/stream`,
                body: payload,
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
            setChatLoading(false);
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;
        await submitMessage(input.trim(), messages);
    };

    const handleEditSubmit = async (messageId: string) => {
        if (!editInput.trim()) return;
        const index = messages.findIndex((m) => m.id === messageId);
        if (index === -1) return;
        
        const promptText = editInput.trim();
        const historyBeforeEdit = messages.slice(0, index);
        
        setEditingMessageId(null);
        setEditInput('');
        
        await submitMessage(promptText, historyBeforeEdit);
    };

    // Regenerate Assistant response in Playground
    const handleRegenerate = async (assistantMessageId: string) => {
        if (chatLoading) return;
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
        setChatLoading(true);

        try {
            const payload: PlaygroundPayload = {
                prompt: userPrompt,
                history: buildHistory(slicedMessages),
            };

            if (selectedModel) {
                payload.model = selectedModel;
            }

            if (selectedApp !== 'all') {
                payload.app_name = selectedApp;
                payload.selected_tools = Array.from(selectedToolNames);
            }

            await streamAgentResponse({
                url: `${NEXT_PUBLIC_BE_API_URL}/agent/playground/query/stream`,
                body: payload,
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
            setChatLoading(false);
            inputRef.current?.focus();
        }
    };

    // Edit User message in Playground
    const handleEditUserMessage = (userMessageId: string, content: string) => {
        if (chatLoading) return;
        const index = messages.findIndex((m) => m.id === userMessageId);
        if (index !== -1) {
            setMessages(messages.slice(0, index));
        }
        setInput(content);
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    // Resend User message in Playground
    const handleResendUserMessage = async (userMessageId: string, content: string) => {
        if (chatLoading || !content.trim()) return;
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
        setChatLoading(true);

        try {
            const payload: PlaygroundPayload = {
                prompt: content,
                history: buildHistory(slicedMessages.slice(0, -1)),
            };

            if (selectedModel) {
                payload.model = selectedModel;
            }

            if (selectedApp !== 'all') {
                payload.app_name = selectedApp;
                payload.selected_tools = Array.from(selectedToolNames);
            }

            await streamAgentResponse({
                url: `${NEXT_PUBLIC_BE_API_URL}/agent/playground/query/stream`,
                body: payload,
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
            setChatLoading(false);
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

    const uniqueApps = Array.from(new Set(catalogTools.map(t => t.app))).sort();

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col overflow-hidden transition-colors duration-200">
            {/* Navigation */}
            <Navigation pageTitle="Playground" />

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col pt-8 pb-4 relative z-10">
                <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 flex flex-col h-full gap-6">
                    {/* Header Controls */}
                    <div className="bg-white dark:bg-slate-900 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold bg-gradient-to-r from-rose-600 to-orange-600 bg-clip-text text-transparent">
                                Testing Playground
                            </h1>
                            <p className="text-slate-700 dark:text-slate-300 text-sm mt-1 font-medium">
                                Select an application to filter the LLM agent&apos;s tool access context.
                            </p>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                            <div className="w-full sm:w-56">
                                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">Ollama Model</label>
                                {ollamaModels.length > 0 ? (
                                    <select
                                        value={selectedModel}
                                        onChange={(e) => setSelectedModel(e.target.value)}
                                        className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm rounded-xl focus:ring-2 focus:ring-rose-500/40 block p-2.5 shadow-xs"
                                    >
                                        {ollamaModels.map((model) => (
                                            <option key={model} value={model}>{model}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <div className="text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2">
                                        {modelError ? modelError : 'No models loaded'}
                                    </div>
                                )}
                            </div>
                            {loading ? (
                                <div className="text-sm font-medium text-slate-500 animate-pulse">Loading apps...</div>
                            ) : (
                                <div className="w-full sm:w-64">
                                    <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">Application Context</label>
                                    <select
                                        value={selectedApp}
                                        onChange={(e) => handleAppSelect(e.target.value)}
                                        className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm rounded-xl focus:ring-2 focus:ring-rose-500/40 block p-2.5 shadow-xs"
                                    >
                                        <option value="all">🌐 All Applications (Unrestricted)</option>
                                        {uniqueApps.map(app => (
                                            <option key={app} value={app}>📦 {app}</option>
                                        ))}
                                        {servers.filter(s => !uniqueApps.includes(`mcp:${s.name}`)).map(s => (
                                            <option key={`mcp:${s.name}`} value={`mcp:${s.name}`}>⚙️ {s.name} (Server)</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>

                    {error && (
                        <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-800 dark:text-rose-300">
                            {error}
                        </div>
                    )}

                    {/* Chat Container */}
                    <div className="flex-1 bg-white dark:bg-slate-900 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col shadow-xs">
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
                            {messages.map((message, index) => (
                                <div
                                    key={message.id}
                                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-slideInUp`}
                                    style={{ animationDelay: `${index * 0.05}s` }}
                                >
                                    <div className={`flex gap-3 max-w-xs sm:max-w-md lg:max-w-2xl`}>
                                        {message.role === 'assistant' && (
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-500 to-orange-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-rose-500/30">
                                                <span className="text-white text-xs font-bold">AI</span>
                                            </div>
                                        )}
                                        {message.role === 'user' && editingMessageId !== message.id && (
                                            <button
                                                onClick={() => {
                                                    setEditingMessageId(message.id);
                                                    setEditInput(message.content);
                                                }}
                                                className="self-center p-2 mr-1 text-slate-400 hover:text-rose-600 bg-white/50 dark:bg-slate-800/50 rounded-full transition-all hover:bg-white dark:hover:bg-slate-700 shadow-sm opacity-60 hover:opacity-100"
                                                title="Edit message"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                                            </button>
                                        )}
                                        <div
                                            className={`relative group px-5 py-4 rounded-2xl transition-all duration-200 ${message.role === 'user'
                                                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-br-none shadow-md shadow-blue-500/20'
                                                    : 'bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white rounded-bl-none border border-slate-200 dark:border-slate-700 shadow-xs'
                                                }`}
                                        >
                                            {editingMessageId === message.id ? (
                                                <div className="flex flex-col gap-2 min-w-[200px] sm:min-w-[300px]">
                                                    <textarea
                                                        value={editInput}
                                                        onChange={(e) => setEditInput(e.target.value)}
                                                        className="w-full bg-white/10 border border-white/20 rounded-xl p-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/50 resize-none"
                                                        rows={3}
                                                        autoFocus
                                                    />
                                                    <div className="flex justify-end gap-2 mt-1">
                                                        <button 
                                                            onClick={() => setEditingMessageId(null)}
                                                            className="px-3 py-1.5 text-xs font-semibold bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button 
                                                            onClick={() => handleEditSubmit(message.id)}
                                                            className="px-3 py-1.5 text-xs font-semibold bg-white text-slate-800 hover:bg-slate-100 rounded-lg transition-colors shadow-sm"
                                                        >
                                                            Save & Resend
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-sm sm:text-base leading-relaxed">
                                                    {message.content ? (
                                                        <MessageContent content={message.content} isUser={message.role === 'user'} />
                                                    ) : (
                                                        <div className="flex gap-2 py-1">
                                                            <div className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-bounce"></div>
                                                            <div className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                                                            <div className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {editingMessageId !== message.id && (
                                                <span className={`text-xs mt-2 block opacity-75 ${message.role === 'user' ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                                                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            )}
                                        </div>
                                        {message.role === 'user' && (
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-500/30">
                                                <span className="text-white text-xs font-bold">U</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {chatLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                                <div className="flex justify-start animate-slideInLeft">
                                    <div className="flex gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-500 to-orange-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-rose-400/30">
                                            <span className="text-white text-xs font-bold">AI</span>
                                        </div>
                                        <div className="bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white px-5 py-4 rounded-2xl rounded-bl-none border border-slate-200 dark:border-slate-700 shadow-xs">
                                            <div className="flex gap-2">
                                                <div className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-bounce"></div>
                                                <div className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                                                <div className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 backdrop-blur-xl p-4 sm:p-5">
                            <form onSubmit={handleSendMessage} className="flex gap-3">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Ask the agent to test a tool..."
                                    className="flex-1 px-5 py-3 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/40 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 transition-all duration-200 font-medium"
                                    disabled={chatLoading}
                                />
                                <button
                                    type="submit"
                                    disabled={chatLoading || !input.trim()}
                                    className="cursor-pointer bg-gradient-to-r from-rose-500 to-orange-600 hover:from-rose-600 hover:to-orange-700 text-white px-6 sm:px-8 py-3 rounded-xl font-bold disabled:opacity-50 transition-all duration-200 shadow-sm active:scale-95"
                                >
                                    {chatLoading ? (
                                        <span className="inline-block animate-spin">⚙️</span>
                                    ) : (
                                        'Run Test'
                                    )}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </main>

            {/* Tool Selection Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-slideInUp border border-slate-200 dark:border-slate-800">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                <span className="bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 p-1.5 rounded-lg border border-rose-200 dark:border-rose-800/50">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                </span>
                                Configure Test Context
                            </h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                                Select the specific tools from <strong>{selectedApp}</strong> you want the LLM agent to evaluate. Unchecked tools will be hidden from the agent.
                            </p>
                        </div>

                        <div className="p-4 bg-slate-100/50 dark:bg-slate-800/50 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
                            <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                {selectedToolNames.size} of {appTools.length} tools selected
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setSelectedToolNames(new Set(appTools.map(t => t.name)))}
                                    className="text-xs font-semibold text-rose-600 dark:text-rose-400 bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-800 px-3 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                                >
                                    Select All
                                </button>
                                <button
                                    onClick={() => setSelectedToolNames(new Set())}
                                    className="text-xs font-semibold text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                >
                                    Deselect All
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2">
                            <div className="grid gap-1">
                                {appTools.length === 0 ? (
                                    <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                                        No tools found for this application.
                                    </div>
                                ) : (
                                    appTools.map((tool) => (
                                        <label
                                            key={tool.name}
                                            className={`flex items-start gap-3 p-4 rounded-xl cursor-pointer transition-all border ${selectedToolNames.has(tool.name)
                                                    ? 'bg-rose-50/50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60 shadow-sm'
                                                    : 'bg-white dark:bg-slate-900 border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                                }`}
                                        >
                                            <div className="pt-0.5">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedToolNames.has(tool.name)}
                                                    onChange={() => toggleToolSelection(tool.name)}
                                                    className="w-5 h-5 text-rose-500 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 rounded focus:ring-rose-500 focus:ring-2 cursor-pointer"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{tool.title || tool.name}</p>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                                    <span className="font-mono text-rose-600 dark:text-rose-400">{tool.method.toUpperCase()}</span> {tool.path}
                                                </p>
                                                <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-1 break-all bg-white dark:bg-slate-800 py-1 px-2 rounded border border-slate-100 dark:border-slate-700 inline-block">
                                                    {tool.name}
                                                </p>
                                            </div>
                                        </label>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-end gap-3 rounded-b-2xl">
                            <button
                                onClick={() => {
                                    setIsModalOpen(false);
                                    setSelectedApp('all');
                                }}
                                className="px-5 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleModalConfirm}
                                disabled={selectedToolNames.size === 0 && appTools.length > 0}
                                className="px-6 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 rounded-xl shadow-md shadow-rose-200 dark:shadow-none hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                            >
                                Start Testing
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
