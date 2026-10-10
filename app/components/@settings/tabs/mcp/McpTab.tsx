import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import McpServerList from '~/components/@settings/tabs/mcp/McpServerList';
import type { MCPConfig } from '~/lib/services/mcpService';
import { useMCPStore } from '~/lib/stores/mcp';
import { classNames } from '~/utils/classNames';

const EXAMPLE_MCP_CONFIG: MCPConfig = {
  mcpServers: {
    everything: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-everything'],
    },
    deepwiki: {
      type: 'streamable-http',
      url: 'https://mcp.deepwiki.com/mcp',
    },
    '21st': {
      type: 'streamable-http',
      url: 'https://21st.dev/api/mcp',
      headers: {
        'x-api-key': 'YOUR_21ST_API_KEY',
      },
    },
    'local-sse': {
      type: 'sse',
      url: 'http://localhost:8000/sse',
      headers: {
        Authorization: 'Bearer mytoken123',
      },
    },
  },
};

const RECOMMENDED_SERVERS = [
  {
    id: '21st',
    name: '21st Components',
    description: '10,000+ React/Tailwind/shadcn UI components - search, install, and generate UI',
    url: 'https://21st.dev/mcp',
    learnMoreUrl: 'https://21st.dev/blog/mcp-ui-components',
    requiresApiKey: true,
    icon: 'i-ph:palette',
    config: {
      type: 'streamable-http' as const,
      url: 'https://21st.dev/api/mcp',
      headers: {
        'x-api-key': 'YOUR_21ST_API_KEY',
      },
    },
  },
  {
    id: 'deepwiki',
    name: 'DeepWiki',
    description: 'Explore and ask questions about GitHub repository documentation',
    url: 'https://mcp.deepwiki.com',
    requiresApiKey: false,
    icon: 'i-ph:book-open',
    config: {
      type: 'streamable-http' as const,
      url: 'https://mcp.deepwiki.com/mcp',
    },
  },
];

export default function McpTab() {
  const settings = useMCPStore((state) => state.settings);
  const isInitialized = useMCPStore((state) => state.isInitialized);
  const serverTools = useMCPStore((state) => state.serverTools);
  const initialize = useMCPStore((state) => state.initialize);
  const updateSettings = useMCPStore((state) => state.updateSettings);
  const checkServersAvailabilities = useMCPStore((state) => state.checkServersAvailabilities);

  const [isSaving, setIsSaving] = useState(false);
  const [mcpConfigText, setMCPConfigText] = useState('');
  const [maxLLMSteps, setMaxLLMSteps] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingServers, setIsCheckingServers] = useState(false);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);

  useEffect(() => {
    if (!isInitialized) {
      initialize().catch((err) => {
        setError(`Failed to initialize MCP settings: ${err instanceof Error ? err.message : String(err)}`);
        toast.error('Failed to load MCP configuration');
      });
    }
  }, [isInitialized]);

  useEffect(() => {
    setMCPConfigText(JSON.stringify(settings.mcpConfig, null, 2));
    setMaxLLMSteps(settings.maxLLMSteps);
    setError(null);
  }, [settings]);

  const parsedConfig = useMemo(() => {
    try {
      setError(null);
      return JSON.parse(mcpConfigText) as MCPConfig;
    } catch (e) {
      setError(`Invalid JSON format: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }, [mcpConfigText]);

  const handleMaxLLMCallChange = (value: string) => {
    setMaxLLMSteps(parseInt(value, 10));
  };

  const handleSave = async () => {
    if (!parsedConfig) {
      return;
    }

    setIsSaving(true);

    try {
      await updateSettings({
        mcpConfig: parsedConfig,
        maxLLMSteps,
      });
      toast.success('MCP configuration saved');

      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save configuration');
      toast.error('Failed to save MCP configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadExample = () => {
    setMCPConfigText(JSON.stringify(EXAMPLE_MCP_CONFIG, null, 2));
    setError(null);
  };

  const handleAddRecommendedServer = (server: (typeof RECOMMENDED_SERVERS)[0]) => {
    try {
      if (!parsedConfig) {
        toast.error('Fix the MCP configuration JSON before adding a server');
        return;
      }

      const currentConfig = parsedConfig;

      const newConfig = {
        ...currentConfig,
        mcpServers: {
          ...currentConfig.mcpServers,
          [server.id]: server.config,
        },
      };
      setMCPConfigText(JSON.stringify(newConfig, null, 2));
      toast.success(`${server.name} added to the unsaved configuration. Save to apply it.`);
      setError(null);
    } catch {
      toast.error(`Failed to add ${server.name}`);
    }
  };

  const checkServerAvailability = async () => {
    if (serverEntries.length === 0) {
      return;
    }

    setIsCheckingServers(true);
    setError(null);

    try {
      await checkServersAvailabilities();
    } catch (e) {
      setError(`Failed to check server availability: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsCheckingServers(false);
    }
  };

  const toggleServerExpanded = (serverName: string) => {
    setExpandedServer(expandedServer === serverName ? null : serverName);
  };

  const serverEntries = useMemo(() => Object.entries(serverTools), [serverTools]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <section aria-labelledby="server-status-heading">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-base font-medium text-bolt-elements-textPrimary">MCP Servers Configured</h2>{' '}
          <button
            onClick={checkServerAvailability}
            disabled={isCheckingServers || !parsedConfig || serverEntries.length === 0}
            className={classNames(
              'px-3 py-1.5 rounded-lg text-sm',
              'bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-4',
              'text-bolt-elements-textPrimary',
              'transition-all duration-200',
              'flex items-center gap-2',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {isCheckingServers ? (
              <div className="i-svg-spinners:90-ring-with-bg w-3 h-3 text-bolt-elements-loader-progress animate-spin" />
            ) : (
              <div className="i-ph:arrow-counter-clockwise w-3 h-3" />
            )}
            Check availability
          </button>
        </div>
        <McpServerList
          checkingServers={isCheckingServers}
          expandedServer={expandedServer}
          serverEntries={serverEntries}
          toggleServerExpanded={toggleServerExpanded}
        />
      </section>

      <section aria-labelledby="recommended-servers-heading">
        <h2 className="text-base font-medium text-bolt-elements-textPrimary mb-3">Recommended Servers</h2>
        <div className="space-y-3">
          {RECOMMENDED_SERVERS.map((server) => {
            const isAlreadyAdded = !!parsedConfig?.mcpServers?.[server.id];
            return (
              <div
                key={server.id}
                className={classNames(
                  'p-4 rounded-lg border transition-all',
                  isAlreadyAdded
                    ? 'border-green-500/30 bg-green-500/5'
                    : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3',
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div
                      className={classNames(
                        server.icon,
                        'w-5 h-5 mt-0.5',
                        isAlreadyAdded ? 'text-green-500' : 'text-bolt-elements-textSecondary',
                      )}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-bolt-elements-textPrimary">{server.name}</h3>
                        {isAlreadyAdded && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/15 text-green-600 dark:text-green-400">
                            Added
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-bolt-elements-textSecondary mt-1">{server.description}</p>
                      {server.requiresApiKey && !isAlreadyAdded && (
                        <p className="text-xs text-bolt-elements-textTertiary mt-2">
                          Requires API key from{' '}
                          <a
                            href={server.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-bolt-elements-link hover:underline"
                          >
                            {server.url}
                          </a>
                        </p>
                      )}
                      {server.learnMoreUrl && (
                        <a
                          href={server.learnMoreUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-bolt-elements-link hover:underline inline-flex items-center gap-1 mt-2"
                        >
                          Learn more
                          <div className="i-ph:arrow-square-out w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleAddRecommendedServer(server)}
                    disabled={isAlreadyAdded}
                    className={classNames(
                      'px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-all',
                      isAlreadyAdded
                        ? 'bg-green-500/10 text-green-600 dark:text-green-400 cursor-not-allowed'
                        : 'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover',
                    )}
                  >
                    {isAlreadyAdded ? 'Added' : 'Add Server'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="config-section-heading">
        <h2 className="text-base font-medium text-bolt-elements-textPrimary mb-3">Configuration</h2>

        <div className="space-y-4">
          <div>
            <label htmlFor="mcp-config" className="block text-sm text-bolt-elements-textSecondary mb-2">
              Configuration JSON
            </label>
            <textarea
              id="mcp-config"
              value={mcpConfigText}
              onChange={(e) => setMCPConfigText(e.target.value)}
              className={classNames(
                'w-full px-3 py-2 rounded-lg text-sm font-mono h-72',
                'bg-[#F8F8F8] dark:bg-[#1A1A1A]',
                'border',
                error ? 'border-bolt-elements-icon-error' : 'border-[#E5E5E5] dark:border-[#333333]',
                'text-bolt-elements-textPrimary',
                'focus:outline-none focus:ring-1 focus:ring-bolt-elements-focus',
              )}
            />
          </div>
          <div>{error && <p className="mt-2 mb-2 text-sm text-bolt-elements-icon-error">{error}</p>}</div>
          <div>
            <label htmlFor="max-llm-steps" className="block text-sm text-bolt-elements-textSecondary mb-2">
              Maximum number of sequential LLM calls (steps)
            </label>
            <input
              id="max-llm-steps"
              type="number"
              placeholder="Maximum number of sequential LLM calls"
              min="1"
              max="20"
              value={maxLLMSteps}
              onChange={(e) => handleMaxLLMCallChange(e.target.value)}
              className="w-full px-3 py-2 text-bolt-elements-textPrimary text-sm rounded-lg bg-white dark:bg-bolt-elements-background-depth-4 border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="mt-2 text-sm text-bolt-elements-textSecondary">
            The MCP configuration format is identical to the one used in Claude Desktop.
            <a
              href="https://modelcontextprotocol.io/examples"
              target="_blank"
              rel="noopener noreferrer"
              className="text-bolt-elements-link hover:underline inline-flex items-center gap-1"
            >
              View example servers
              <div className="i-ph:arrow-square-out w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap justify-between gap-3 mt-6">
        <button
          onClick={handleLoadExample}
          className="px-4 py-2 rounded-lg text-sm border border-bolt-elements-borderColor
                    bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary
                    hover:bg-bolt-elements-background-depth-3"
        >
          Load Example
        </button>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving || !parsedConfig}
            aria-disabled={isSaving || !parsedConfig}
            className={classNames(
              'px-4 py-2 rounded-lg text-sm flex items-center gap-2',
              'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent',
              'hover:bg-bolt-elements-item-backgroundActive',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            <div className="i-ph:floppy-disk w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
}
