import { create } from 'zustand';
import { mcpServerConfigSchema } from '~/lib/services/mcpConfig';
import type { MCPConfig, MCPServerTools } from '~/lib/services/mcpService';

const MCP_SETTINGS_KEY = 'mcp_settings';
const POSTHOG_SESSION_TOKEN_KEY = 'posthog_mcp_token';
const POSTHOG_SERVER_ID = 'posthog';
const POSTHOG_SERVER_URL = 'https://mcp.posthog.com/mcp';
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

    const previousPostHogToken = isBrowser ? sessionStorage.getItem(POSTHOG_SESSION_TOKEN_KEY) : null;

    try {
      set(() => ({ isUpdatingConfig: true }));

      const safeSettings = sanitizePostHogSettings(newSettings, get().settings);
      const serverTools = await updateServerConfig(safeSettings.mcpConfig);

      persistSettings(safeSettings);

      set(() => ({ settings: safeSettings, serverTools }));
    } catch (error) {
      if (isBrowser) {
        if (previousPostHogToken === null) {
          sessionStorage.removeItem(POSTHOG_SESSION_TOKEN_KEY);
        } else {
          sessionStorage.setItem(POSTHOG_SESSION_TOKEN_KEY, previousPostHogToken);
        }
      }

      throw error;
    } finally {
      set(() => ({ isUpdatingConfig: false }));
    }
  },
  checkServersAvailabilities: async () => {
    const response = await fetch('/api/mcp-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(get().settings.mcpConfig),
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

  if (!server || server.type === 'stdio') {
    sessionStorage.removeItem(POSTHOG_SESSION_TOKEN_KEY);
    return;
  }

  const headers = 'headers' in server ? (server.headers ?? {}) : {};

  if (server.url === POSTHOG_SERVER_URL) {
    const token = getStoredPostHogToken(server.url) || getBearerToken(headers);

    if (token) {
      storePostHogToken(server.url, token);
    } else {
      sessionStorage.removeItem(POSTHOG_SESSION_TOKEN_KEY);
    }

    settings.mcpConfig.mcpServers[POSTHOG_SERVER_ID] = {
      ...server,
      headers: { ...withoutAuthorization(headers), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    };

    return;
  }

  const sessionToken = getStoredPostHogToken(POSTHOG_SERVER_URL);

  const safeHeaders = sessionToken ? withoutBearerToken(headers, sessionToken) : headers;
  sessionStorage.removeItem(POSTHOG_SESSION_TOKEN_KEY);
  settings.mcpConfig.mcpServers[POSTHOG_SERVER_ID] = { ...server, headers: safeHeaders };
}

function getStoredPostHogToken(serverUrl: string): string {
  const stored = sessionStorage.getItem(POSTHOG_SESSION_TOKEN_KEY);

  if (!stored) {
    return '';
  }

  try {
    const value = JSON.parse(stored) as { url?: string; token?: string };
    return value.url === serverUrl && typeof value.token === 'string' ? value.token : '';
  } catch {
    // Accept a legacy token only when restoring the known first-party PostHog URL.
    return serverUrl === POSTHOG_SERVER_URL ? stored : '';
  }
}

function storePostHogToken(serverUrl: string, token: string) {
  sessionStorage.setItem(POSTHOG_SESSION_TOKEN_KEY, JSON.stringify({ url: serverUrl, token }));
}

function sanitizePostHogSettings(settings: MCPSettings, previousSettings: MCPSettings): MCPSettings {
  const server = settings.mcpConfig.mcpServers[POSTHOG_SERVER_ID];

  if (!isBrowser) {
    return settings;
  }

  if (!server || server.type === 'stdio') {
    sessionStorage.removeItem(POSTHOG_SESSION_TOKEN_KEY);
    return settings;
  }

  const headers = { ...(server.headers ?? {}) };

  if (server.url === POSTHOG_SERVER_URL) {
    const token = getBearerToken(headers);

    if (token) {
      storePostHogToken(server.url, token);
    } else {
      sessionStorage.removeItem(POSTHOG_SESSION_TOKEN_KEY);
    }

    return {
      ...settings,
      mcpConfig: {
        ...settings.mcpConfig,
        mcpServers: {
          ...settings.mcpConfig.mcpServers,
          [POSTHOG_SERVER_ID]: {
            ...server,
            headers: { ...withoutAuthorization(headers), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          },
        },
      },
    };
  }

  const previousServer = previousSettings.mcpConfig.mcpServers[POSTHOG_SERVER_ID];
  const previousHeaders = previousServer && 'headers' in previousServer ? (previousServer.headers ?? {}) : {};

  const previousFirstPartyToken =
    previousServer?.type !== 'stdio' && previousServer?.url === POSTHOG_SERVER_URL
      ? getBearerToken(previousHeaders) || getStoredPostHogToken(POSTHOG_SERVER_URL)
      : getStoredPostHogToken(POSTHOG_SERVER_URL);

  const safeHeaders = previousFirstPartyToken ? withoutBearerToken(headers, previousFirstPartyToken) : headers;
  sessionStorage.removeItem(POSTHOG_SESSION_TOKEN_KEY);

  return {
    ...settings,
    mcpConfig: {
      ...settings.mcpConfig,
      mcpServers: { ...settings.mcpConfig.mcpServers, [POSTHOG_SERVER_ID]: { ...server, headers: safeHeaders } },
    },
  };
}

function getBearerToken(headers: Record<string, string>): string | undefined {
  const authorization = Object.entries(headers).find(([name]) => name.toLowerCase() === 'authorization')?.[1];
  return authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
}

function withoutAuthorization(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => name.toLowerCase() !== 'authorization'));
}

function withoutBearerToken(headers: Record<string, string>, token: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name, value]) => {
      return name.toLowerCase() !== 'authorization' || value.match(/^Bearer\s+(.+)$/i)?.[1] !== token;
    }),
  );
}

function persistSettings(settings: MCPSettings) {
  if (!isBrowser) {
    return;
  }

  const mcpServers = { ...settings.mcpConfig.mcpServers };
  const posthogServer = mcpServers[POSTHOG_SERVER_ID];

  if (posthogServer && posthogServer.type !== 'stdio' && posthogServer.url === POSTHOG_SERVER_URL) {
    const headers = 'headers' in posthogServer ? (posthogServer.headers ?? {}) : {};
    const authorizationToken = getBearerToken(headers);

    if (authorizationToken) {
      storePostHogToken(posthogServer.url, authorizationToken);
    } else {
      sessionStorage.removeItem(POSTHOG_SESSION_TOKEN_KEY);
    }

    const safeHeaders = withoutAuthorization(headers);
    mcpServers[POSTHOG_SERVER_ID] = { ...posthogServer, headers: safeHeaders };
  } else if (posthogServer && posthogServer.type !== 'stdio') {
    // Custom endpoints keep credentials explicitly configured for that endpoint.
    sessionStorage.removeItem(POSTHOG_SESSION_TOKEN_KEY);
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
