import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'react-toastify';
import { useMCPStore } from '~/lib/stores/mcp';
import { classNames } from '~/utils/classNames';

const SERVER_ID = 'posthog';
const SERVER_URL = 'https://mcp.posthog.com/mcp';

export default function PostHogTab() {
  const settings = useMCPStore((state) => state.settings);
  const server = useMCPStore((state) => state.serverTools[SERVER_ID]);
  const isInitialized = useMCPStore((state) => state.isInitialized);
  const isUpdatingConfig = useMCPStore((state) => state.isUpdatingConfig);
  const initialize = useMCPStore((state) => state.initialize);
  const updateSettings = useMCPStore((state) => state.updateSettings);
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    if (!isInitialized) {
      void initialize();
    }
  }, [initialize, isInitialized]);

  const mcpServers = settings?.mcpConfig?.mcpServers;
  const safeMcpServers = mcpServers && typeof mcpServers === 'object' ? mcpServers : {};

  const configuredServer = safeMcpServers[SERVER_ID];

  const isConnected = Boolean(
    configuredServer &&
    configuredServer.type !== 'stdio' &&
    'headers' in configuredServer &&
    configuredServer.headers?.Authorization,
  );

  const availableTools = server?.status === 'available' ? Object.keys(server.tools).length : 0;

  const handleConnect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const token = apiKey.trim();

    if (!token) {
      toast.error('Enter a PostHog personal API key');
      return;
    }

    const mcpConfig = {
      ...settings.mcpConfig,
      mcpServers: {
        ...safeMcpServers,
        [SERVER_ID]: {
          type: 'streamable-http' as const,
          url: SERVER_URL,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    };

    try {
      await updateSettings({ ...settings, mcpConfig });

      const connectedServer = useMCPStore.getState().serverTools[SERVER_ID];

      if (connectedServer?.status !== 'available') {
        toast.error(
          connectedServer?.status === 'unavailable'
            ? `PostHog configuration saved, but the connection failed: ${connectedServer.error}`
            : 'PostHog configuration saved, but the server did not return any connection status',
        );
        return;
      }

      setApiKey('');
      toast.success('PostHog connected');
    } catch (error) {
      toast.error(`Could not connect to PostHog: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleDisconnect = async () => {
    const nextMcpServers = { ...safeMcpServers };
    delete nextMcpServers[SERVER_ID];

    try {
      await updateSettings({ ...settings, mcpConfig: { ...settings.mcpConfig, mcpServers: nextMcpServers } });
      toast.success('PostHog disconnected');
    } catch (error) {
      toast.error(`Could not disconnect PostHog: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <section className="space-y-5 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5">
      <header className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary">
          <div className="i-ph:chart-line-up h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-bolt-elements-textPrimary">Connect PostHog</h3>
          <p className="mt-1 text-sm text-bolt-elements-textSecondary">
            Give the assistant access to PostHog analytics, error tracking, feature flags, and other MCP tools.
          </p>
        </div>
      </header>

      {isConnected ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-bolt-elements-textPrimary">
              <span
                className={classNames(
                  'h-2 w-2 rounded-full',
                  server?.status === 'available' ? 'bg-green-500' : 'bg-amber-500',
                )}
              />
              {server?.status === 'available'
                ? `Connected · ${availableTools} tools available`
                : 'Connection configured'}
            </div>
            {server?.status === 'unavailable' && <p className="mt-2 text-xs text-red-500">{server.error}</p>}
            <p className="mt-2 text-xs text-bolt-elements-textTertiary">
              Manage the available tools and check the connection in Settings → MCP Servers.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={isUpdatingConfig}
            className="rounded-lg border border-bolt-elements-borderColor px-4 py-2 text-sm text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 disabled:opacity-50"
          >
            {isUpdatingConfig ? 'Disconnecting…' : 'Disconnect PostHog'}
          </button>
        </div>
      ) : (
        <form onSubmit={handleConnect} className="space-y-4">
          <div>
            <label
              htmlFor="posthog-api-key"
              className="mb-1.5 block text-sm font-medium text-bolt-elements-textPrimary"
            >
              Personal API key
            </label>
            <input
              id="posthog-api-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="phx_…"
              className="w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-item-contentAccent"
            />
            <p className="mt-2 text-xs text-bolt-elements-textTertiary">
              Create a personal API key in PostHog with the MCP Server preset. The key is kept only for this browser
              session.
            </p>
          </div>
          <a
            href="https://posthog.com/docs/model-context-protocol"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-bolt-elements-item-contentAccent hover:underline"
          >
            PostHog MCP setup guide <span aria-hidden="true">↗</span>
          </a>
          <div>
            <button
              type="submit"
              disabled={!isInitialized || isUpdatingConfig || !apiKey.trim()}
              className="rounded-lg bg-bolt-elements-item-contentAccent px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
            >
              {isUpdatingConfig ? 'Connecting…' : 'Connect PostHog'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
