'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Navigation from '@/components/Navigation';
import Card from '@/components/ui/Card';

const NEXT_PUBLIC_BE_API_URL = process.env.NEXT_PUBLIC_BE_API_URL


interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

interface ServerToolsData {
  server: string;
  url: string;
  tools: Tool[];
  tool_count: number;
}

export default function ServerToolsPage() {
  const params = useParams();
  const serverName = params?.name as string;
  
  const [serverData, setServerData] = useState<ServerToolsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const fetchServerTools = async () => {
      try {
        setLoading(true);
        setError(null);
        
        if (!serverName) {
          setError('Server name not found');
          return;
        }

        const response = await fetch(`${NEXT_PUBLIC_BE_API_URL}/servers/${serverName}/tools`);
        
        if (!response.ok) {
          if (response.status === 404) {
            setError(`Server "${serverName}" not found`);
          } else {
            setError(`Failed to fetch tools: ${response.statusText}`);
          }
          return;
        }

        const data = await response.json();
        setServerData(data);
      } catch (err) {
        setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        console.error('Error fetching server tools:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchServerTools();
  }, [serverName]);

  const toggleToolExpand = (toolName: string) => {
    const newExpanded = new Set(expandedTools);
    if (newExpanded.has(toolName)) {
      newExpanded.delete(toolName);
    } else {
      newExpanded.add(toolName);
    }
    setExpandedTools(newExpanded);
  };

  const formatSchema = (schema: Record<string, any>) => {
    return JSON.stringify(schema, null, 2);
  };

  if (loading) {
    return (
      <div className={`min-h-screen ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
        <Navigation pageTitle="Server Details" />
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
            <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>Loading server tools...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`min-h-screen ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
        <Navigation pageTitle="Server Details" />
        <div className="max-w-6xl mx-auto px-4 py-8">
          <Card className="bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800 my-18">
            <div className="p-6">
              <h3 className="text-red-800 dark:text-red-400 font-semibold mb-2">Error</h3>
              <p className="text-red-700 dark:text-red-300">{error}</p>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (!serverData) {
    return (
      <div className={`min-h-screen ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
        <Navigation pageTitle="Server Details" />
        <div className="max-w-6xl mx-auto px-4 py-8">
          <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>No server data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
      <Navigation pageTitle="Server Details" />
      
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Server Header */}
        <div className="mb-8 mt-18">
          <Card className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800">
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">⚡</span>
                    <h1 className={`text-3xl font-bold ${isDark ? 'text-green-400' : 'text-green-700'}`}>
                      {serverData.server}
                    </h1>
                  </div>
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    {serverData.url}
                  </p>
                </div>
                <div className={`px-4 py-2 rounded-lg ${isDark ? 'bg-green-900/40' : 'bg-green-100'}`}>
                  <p className={`text-sm font-semibold ${isDark ? 'text-green-300' : 'text-green-700'}`}>
                    {serverData.tool_count} Tools
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Tools List */}
        <div>
          <h2 className={`text-2xl font-bold mb-4 ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>
            Available Tools
          </h2>
          
          {serverData.tools.length === 0 ? (
            <Card className={`p-6 text-center ${isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-50 text-gray-600'}`}>
              <p>No tools available for this server</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {serverData.tools.map((tool) => (
                <div
                  key={tool.name}
                  className={`border rounded-lg transition-all cursor-pointer ${
                    expandedTools.has(tool.name)
                      ? isDark
                        ? 'bg-gray-800 border-green-600'
                        : 'bg-green-50 border-green-300'
                      : isDark
                      ? 'bg-gray-800 border-gray-700 hover:border-green-600'
                      : 'bg-white border-gray-200 hover:border-green-300'
                  }`}
                  onClick={() => toggleToolExpand(tool.name)}
                >
                  <div className="p-6">
                    {/* Tool Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-xl">⚙️</span>
                          <h3 className={`font-semibold text-lg ${isDark ? 'text-green-400' : 'text-green-700'}`}>
                            {tool.name}
                          </h3>
                        </div>
                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                          {tool.description}
                        </p>
                      </div>
                      <div className={`text-xl ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        {expandedTools.has(tool.name) ? '▲' : '▼'}
                      </div>
                    </div>

                    {/* Tool Details - Expandable */}
                    {expandedTools.has(tool.name) && (
                      <div className={`mt-6 pt-6 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                        <div className="space-y-4">
                          <div>
                            <h4 className={`font-semibold mb-2 text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                              Input Schema
                            </h4>
                            <pre className={`p-4 rounded overflow-auto max-h-96 text-xs font-mono ${
                              isDark
                                ? 'bg-gray-900 text-gray-300 border border-gray-700'
                                : 'bg-gray-100 text-gray-800 border border-gray-200'
                            }`}>
                              {formatSchema(tool.inputSchema)}
                            </pre>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
