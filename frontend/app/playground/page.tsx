'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import Navigation from '@/components/Navigation';
import { publicEnv } from '@/lib/env';
import { authenticatedFetch } from '@/services/http';

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

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    /* --- data fetching --- */
    const fetchData = useCallback(async () => {
        if (!NEXT_PUBLIC_BE_API_URL) {
            setError('Backend API URL is not configured (NEXT_PUBLIC_BE_API_URL)');
            setLoading(false);
            return;
        }
        try {
            setLoading(true);
            // Fetch both servers and the public catalog of tools
            const [serversRes, catalogRes, modelsRes] = await Promise.allSettled([
                authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/servers`),
                authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/mcp/openapi/catalog?force_refresh=false&public_only=true`),
                authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/agent/models`),
            ]);

            let loadedServers: ServerItem[] = [];
            let loadedTools: CatalogTool[] = [];

            if (serversRes.status === 'fulfilled' && serversRes.value.ok) {
                const payload = await serversRes.value.json();
                loadedServers = Array.isArray(payload?.servers) ? payload.servers : [];
                setServers(loadedServers);
            }

            if (catalogRes.status === 'fulfilled' && catalogRes.value.ok) {
                const payload = await catalogRes.value.json();
                loadedTools = Array.isArray(payload?.tools) ? payload.tools : [];
                setCatalogTools(loadedTools);
            }

            if (modelsRes.status === 'fulfilled' && modelsRes.value.ok) {
                const payload = await modelsRes.value.json();
                const models = Array.isArray(payload?.models) ? payload.models : [];
                setOllamaModels(models);
                const defaultModel = typeof payload?.default_model === 'string' ? payload.default_model : '';
                setSelectedModel((prev) => prev || defaultModel || models[0] || '');
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

    // Handle Application Selection
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
            // Filter tools for this specific app
            const toolsForApp = catalogTools.filter(t => t.app === appName);
            setAppTools(toolsForApp);
            // Default all to selected
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
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input,
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setInput('');
        setChatLoading(true);

        try {
            const payload: PlaygroundPayload = {
                prompt: input,
            };

            if (selectedModel) {
                payload.model = selectedModel;
            }

            if (selectedApp !== 'all') {
                payload.app_name = selectedApp;
                payload.selected_tools = Array.from(selectedToolNames);
            }

            const response = await authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/agent/playground/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(`HTTP Error ${response.status}`);
            }

            const data = await response.json();

            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: data.response || "I couldn't process your request. Please try again.",
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
            setChatLoading(false);
        }
    };

    // Get unique app names from the catalog tools
    const uniqueApps = Array.from(new Set(catalogTools.map(t => t.app))).sort();

    return (
        <div className="min-h-screen bg-gradient-to-br from-white via-slate-50 to-slate-100 flex flex-col overflow-hidden">
            {/* Elegant background elements */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-20 left-10 w-80 h-80 bg-rose-400/8 rounded-full blur-3xl animate-float"></div>
                <div className="absolute bottom-20 right-10 w-80 h-80 bg-orange-400/8 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }}></div>
            </div>

            {/* Navigation */}
            <Navigation pageTitle="Playground" />

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col pt-24 pb-4 relative z-10">
                <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 flex flex-col h-full gap-6">
                    {/* Header Controls */}
                    <div className="bg-white/80 backdrop-blur-xl border border-rose-200/50 rounded-2xl p-6 shadow-lg shadow-rose-200/20 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold bg-gradient-to-r from-rose-600 to-orange-600 bg-clip-text text-transparent">
                                Testing Playground
                            </h1>
                            <p className="text-slate-600 text-sm mt-1">
                                Select an application to filter the LLM agent&apos;s tool access context.
                            </p>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                            <div className="w-full sm:w-56">
                                <label className="block text-xs font-medium text-slate-500 mb-1">Ollama Model</label>
                                {ollamaModels.length > 0 ? (
                                    <select
                                        value={selectedModel}
                                        onChange={(e) => setSelectedModel(e.target.value)}
                                        className="w-full bg-white border border-slate-300 text-slate-700 text-sm rounded-lg focus:ring-rose-500 focus:border-rose-500 block p-2.5 shadow-sm transition-all hover:border-rose-300"
                                    >
                                        {ollamaModels.map((model) => (
                                            <option key={model} value={model}>{model}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <div className="text-xs text-slate-400 border border-dashed border-slate-300 rounded-lg px-3 py-2">
                                        {modelError ? modelError : 'No models loaded'}
                                    </div>
                                )}
                            </div>
                            {loading ? (
                                <div className="text-sm font-medium text-slate-500 animate-pulse">Loading apps...</div>
                            ) : (
                                <div className="w-full sm:w-64">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Application Context</label>
                                    <select
                                        value={selectedApp}
                                        onChange={(e) => handleAppSelect(e.target.value)}
                                        className="w-full bg-white border border-slate-300 text-slate-700 text-sm rounded-lg focus:ring-rose-500 focus:border-rose-500 block p-2.5 shadow-sm transition-all hover:border-rose-300"
                                    >
                                        <option value="all">🌐 All Applications (Unrestricted)</option>
                                        {uniqueApps.map(app => (
                                            <option key={app} value={app}>📦 {app}</option>
                                        ))}
                                        {/* Also show raw MCP servers if they have tools */}
                                        {servers.filter(s => !uniqueApps.includes(`mcp:${s.name}`)).map(s => (
                                            <option key={`mcp:${s.name}`} value={`mcp:${s.name}`}>⚙️ {s.name} (Server)</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>

                    {error && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                            {error}
                        </div>
                    )}

                    {/* Chat Container */}
                    <div className="flex-1 bg-white/70 backdrop-blur-xl border border-rose-300/40 rounded-2xl overflow-hidden flex flex-col shadow-xl shadow-orange-200/20">
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
                                        <div
                                            className={`px-5 py-4 rounded-2xl transition-all duration-300 hover:scale-[1.02] ${message.role === 'user'
                                                    ? 'bg-gradient-to-br from-slate-800 to-slate-900 text-white rounded-br-none shadow-lg shadow-slate-900/20'
                                                    : 'bg-white text-slate-800 rounded-bl-none border border-rose-200 shadow-md shadow-rose-100/50'
                                                }`}
                                        >
                                            <div className="text-sm sm:text-base leading-relaxed prose prose-sm max-w-none">
                                                {/* We use basic text rendering here, but a markdown component could be added */}
                                                {message.content.split('\n').map((line, i) => (
                                                    <p key={i} className="m-0 min-h-[1em]">{line}</p>
                                                ))}
                                            </div>
                                            <span className={`text-xs mt-2 block opacity-60 ${message.role === 'user' ? 'text-slate-300' : 'text-slate-500'}`}>
                                                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {chatLoading && (
                                <div className="flex justify-start animate-slideInLeft">
                                    <div className="flex gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-500 to-orange-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-rose-400/30">
                                            <span className="text-white text-xs font-bold">AI</span>
                                        </div>
                                        <div className="bg-white text-slate-800 px-5 py-4 rounded-2xl rounded-bl-none border border-rose-200 shadow-md">
                                            <div className="flex gap-2">
                                                <div className="w-2.5 h-2.5 bg-rose-400 rounded-full animate-bounce"></div>
                                                <div className="w-2.5 h-2.5 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                                                <div className="w-2.5 h-2.5 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="border-t border-rose-200/50 bg-white/80 backdrop-blur-xl p-4 sm:p-5 shadow-lg">
                            <form onSubmit={handleSendMessage} className="flex gap-3">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Ask the agent to test a tool..."
                                    className="flex-1 px-5 py-3 border border-slate-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent bg-white text-slate-800 placeholder-slate-400 transition-all duration-300 hover:border-slate-400 font-medium"
                                    disabled={chatLoading}
                                    autoFocus
                                />
                                <button
                                    type="submit"
                                    disabled={chatLoading || !input.trim()}
                                    className="cursor-pointer bg-gradient-to-r from-rose-500 to-orange-600 hover:from-rose-600 hover:to-orange-700 text-white px-6 sm:px-8 py-3 rounded-2xl font-bold disabled:opacity-50 transition-all duration-300 hover:shadow-lg hover:shadow-rose-400/40 hover:scale-[1.02] shadow-md active:scale-95"
                                >
                                    {chatLoading ? (
                                        <span className="inline-block animate-spin-slow">⚙️</span>
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
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-slideInUp border border-slate-200">
                        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <span className="bg-rose-100 text-rose-600 p-1.5 rounded-lg border border-rose-200">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                </span>
                                Configure Test Context
                            </h2>
                            <p className="text-sm text-slate-500 mt-2">
                                Select the specific tools from <strong>{selectedApp}</strong> you want the LLM agent to evaluate. Unchecked tools will be hidden from the agent.
                            </p>
                        </div>

                        <div className="p-4 bg-slate-100/50 flex items-center justify-between border-b border-slate-200">
                            <div className="text-sm font-semibold text-slate-700">
                                {selectedToolNames.size} of {appTools.length} tools selected
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setSelectedToolNames(new Set(appTools.map(t => t.name)))}
                                    className="text-xs font-semibold text-rose-600 bg-white border border-rose-200 px-3 py-1.5 rounded-lg hover:bg-rose-50 transition-colors"
                                >
                                    Select All
                                </button>
                                <button
                                    onClick={() => setSelectedToolNames(new Set())}
                                    className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                                >
                                    Deselect All
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2">
                            <div className="grid gap-1">
                                {appTools.length === 0 ? (
                                    <div className="p-8 text-center text-slate-500">
                                        No tools found for this application.
                                    </div>
                                ) : (
                                    appTools.map((tool) => (
                                        <label
                                            key={tool.name}
                                            className={`flex items-start gap-3 p-4 rounded-xl cursor-pointer transition-all border ${selectedToolNames.has(tool.name)
                                                    ? 'bg-rose-50/50 border-rose-200 shadow-sm'
                                                    : 'bg-white border-transparent hover:bg-slate-50'
                                                }`}
                                        >
                                            <div className="pt-0.5">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedToolNames.has(tool.name)}
                                                    onChange={() => toggleToolSelection(tool.name)}
                                                    className="w-5 h-5 text-rose-500 bg-white border-slate-300 rounded focus:ring-rose-500 focus:ring-2 cursor-pointer"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-sm font-bold text-slate-800">{tool.title || tool.name}</p>
                                                <p className="text-xs text-slate-500 mt-0.5">
                                                    <span className="font-mono text-rose-600">{tool.method.toUpperCase()}</span> {tool.path}
                                                </p>
                                                <p className="text-xs text-slate-400 font-mono mt-1 break-all bg-white py-1 px-2 rounded border border-slate-100 inline-block">
                                                    {tool.name}
                                                </p>
                                            </div>
                                        </label>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-100 bg-white flex justify-end gap-3 rounded-b-2xl">
                            <button
                                onClick={() => {
                                    setIsModalOpen(false);
                                    setSelectedApp('all');
                                }}
                                className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleModalConfirm}
                                disabled={selectedToolNames.size === 0 && appTools.length > 0}
                                className="px-6 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 rounded-xl shadow-md shadow-rose-200 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
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
