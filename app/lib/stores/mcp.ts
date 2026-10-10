import { create } from 'zustand';
import { mcpServerConfigSchema, type MCPConfig, type MCPServerTools } from '~/lib/services/mcpService';

const MCP_SETTINGS_KEY = 'mcp_settings';
const POSTHOG_SESSION_TOKEN_KEY = 'posthog_mcp_token';
const POSTHOG_SERVER_ID = 'posthog';
const isBrowser = typeof window !== 'undefined';

type MCPSettings = {
  mcpConfig: MCPConfig;
  maxLLMSteps: number;
};

const defaultSettings = {
  maxLLMSteps: 5,
  mcpConfig: {
    mcpServers: {},
  },
} satisfies MCPSettings;

type Store = {
  isInitialized: boolean;
  settings: MCPSettings;
  serverTools: MCPServerTools;
  error: string | null;
  isUpdatingConfig: boolean;
};

type Actions = {
  initialize: () => Promise<void>;
  updateSettings: (settings: MCPSettings) => Promise<void>;
  checkServersAvailabilities: () => Promise<void>;
};

export const useMCPStore = create<Store & Actions>((set, get) => ({
  isInitialized: false,
  settings: defaultSettings,
  serverTools: {},
  error: null,
  isUpdatingConfig: false,
  initialize: async () => {
    if (get().isInitialized) {
      return;
    }

    if (isBrowser) {
      const savedConfig = localStorage.getItem(MCP_SETTINGS_KEY);

      if (savedConfig) {
        try {
          const parsed = JSON.parse(savedConfig) as Partial<MCPSettings> | null;

          const rawServers = parsed?.mcpConfig?.mcpServers;

          const mcpServers =
            rawServers && typeof rawServers === 'object' && !Array.isArray(rawServers)
              ? Object.fromEntries(
                  Object.entries(rawServers).flatMap(([name, server]) => {
                    const validatedServer = mcpServerConfigSchema.safeParse(server);
                    return validatedServer.success ? [[name, validatedServer.data]] : [];
                  }),
                )
              : defaultSettings.mcpConfig.mcpServers;

          const settings: MCPSettings = {
            maxLLMSteps:
              typeof parsed?.maxLLMSteps === 'number' && Number.isFinite(parsed.maxLLMSteps)
                ? parsed.maxLLMSteps
                : defaultSettings.maxLLMSteps,
            mcpConfig: {
              mcpServers,
            },
          };

          restorePostHogSessionToken(settings);

          const serverTools = await updateServerConfig(settings.mcpConfig);
          set(() => ({ settings, serverTools }));
          persistSettings(settings);
        } catch (error) {
          console.error('Error parsing saved mcp config:', error);
          set(() => ({
            error: `Error parsing saved mcp config: ${error instanceof Error ? error.message : String(error)}`,
          }));
        }
      } else {
        localStorage.setItem(MCP_SETTINGS_KEY, JSON.stringify(defaultSettings));
      }
    }

    set(() => ({ isInitialized: true }));
  },
  updateSettings: async (newSettings: MCPSettings) => {
    if (get().isUpdatingConfig) {
      return;
    }

    try {
      set(() => ({ isUpdatingConfig: true }));

      const serverTools = await updateServerConfig(newSettings.mcpConfig);

      persistSettings(newSettings);

      set(() => ({ settings: newSettings, serverTools }));
    } catch (error) {
      throw error;
    } finally {
      set(() => ({ isUpdatingConfig: false }));
    }
  },
  checkServersAvailabilities: async () => {
    const response = await fetch('/api/mcp-check', {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
    }

    const serverTools = (await response.json()) as MCPServerTools;

    set(() => ({ serverTools }));
  },
}));

function restorePostHogSessionToken(settings: MCPSettings) {
  if (!isBrowser) {
    return;
  }

  const server = settings.mcpConfig.mcpServers[POSTHOG_SERVER_ID];

  if (server && server.type !== 'stdio') {
    const headers = 'headers' in server ? (server.headers ?? {}) : {};
    const legacyAuthorization = headers.Authorization;
    const sessionToken = sessionStorage.getItem(POSTHOG_SESSION_TOKEN_KEY);
    const token = sessionToken || (legacyAuthorization?.startsWith('Bearer ') ? legacyAuthorization.slice(7) : '');

    if (token) {
      sessionStorage.setItem(POSTHOG_SESSION_TOKEN_KEY, token);
      settings.mcpConfig.mcpServers[POSTHOG_SERVER_ID] = {
        ...server,
        headers: { ...headers, Authorization: `Bearer ${token}` },
      };
    } else {
      delete settings.mcpConfig.mcpServers[POSTHOG_SERVER_ID];
    }
  }
}

function persistSettings(settings: MCPSettings) {
  if (!isBrowser) {
    return;
  }

  const mcpServers = { ...settings.mcpConfig.mcpServers };
  const posthogServer = mcpServers[POSTHOG_SERVER_ID];

  if (posthogServer && 'headers' in posthogServer) {
    const headers = { ...posthogServer.headers };
    const authorization = headers.Authorization;
    delete headers.Authorization;

    if (authorization?.startsWith('Bearer ')) {
      sessionStorage.setItem(POSTHOG_SESSION_TOKEN_KEY, authorization.slice(7));
    }

    if (Object.keys(headers).length) {
      mcpServers[POSTHOG_SERVER_ID] = { ...posthogServer, headers };
    } else {
      const { headers: _headers, ...serverWithoutHeaders } = posthogServer;
      mcpServers[POSTHOG_SERVER_ID] = serverWithoutHeaders;
    }
  } else {
    sessionStorage.removeItem(POSTHOG_SESSION_TOKEN_KEY);
  }

  const persistedSettings = { ...settings, mcpConfig: { ...settings.mcpConfig, mcpServers } };
  localStorage.setItem(MCP_SETTINGS_KEY, JSON.stringify(persistedSettings));
}

async function updateServerConfig(config: MCPConfig) {
  const response = await fetch('/api/mcp-update-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as MCPServerTools;

  return data;
}
