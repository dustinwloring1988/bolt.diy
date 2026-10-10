import { atom } from 'nanostores';
import type { SupabaseUser, SupabaseStats, SupabaseApiKey, SupabaseCredentials } from '~/types/supabase';

export interface SupabaseProject {
  id: string;
  name: string;
  region: string;
  organization_id: string;
  status: string;
  database?: {
    host: string;
    version: string;
    postgres_engine: string;
    release_channel: string;
  };
  created_at: string;
  stats?: {
    database?: {
      tables: number;
      size: string;
      size_mb?: number;
      views?: number;
      functions?: number;
    };
    storage?: {
      objects: number;
      size: string;
      buckets?: number;
      files?: number;
      used_gb?: number;
      available_gb?: number;
    };
    functions?: {
      count: number;
      deployed?: number;
      invocations?: number;
    };
    auth?: {
      users: number;
    };
  };
}

export interface SupabaseConnectionState {
  user: SupabaseUser | null;
  token: string;
  stats?: SupabaseStats;
  selectedProjectId?: string;
  isConnected?: boolean;
  project?: SupabaseProject;
  credentials?: SupabaseCredentials;
}

const storage =
  typeof globalThis !== 'undefined' &&
  typeof globalThis.localStorage !== 'undefined' &&
  typeof globalThis.localStorage.getItem === 'function'
    ? globalThis.localStorage
    : null;

const savedConnection = storage ? storage.getItem('supabase_connection') : null;
const savedCredentials = storage ? storage.getItem('supabaseCredentials') : null;

const initialState: SupabaseConnectionState = savedConnection
  ? JSON.parse(savedConnection)
  : {
      user: null,
      token: '',
      stats: undefined,
      selectedProjectId: undefined,
      isConnected: false,
      project: undefined,
    };

if (savedCredentials && !initialState.credentials) {
  try {
    initialState.credentials = JSON.parse(savedCredentials);
  } catch (e) {
    console.error('Failed to parse saved credentials:', e);
  }
}

export const supabaseConnection = atom<SupabaseConnectionState>(initialState);

let connectionRevision = 0;
let apiKeyRequestRevision = 0;

export const isConnecting = atom(false);
export const isFetchingStats = atom(false);
export const isFetchingApiKeys = atom(false);

if (initialState.token && !initialState.stats) {
  fetchSupabaseStats(initialState.token).catch(console.error);
}

export function updateSupabaseConnection(connection: Partial<SupabaseConnectionState>) {
  const currentState = supabaseConnection.get();

  const accountChanged = connection.user !== undefined && connection.user?.id !== currentState.user?.id;
  const tokenChanged = connection.token !== undefined && connection.token !== currentState.token;

  const connectionStatusChanged =
    connection.isConnected !== undefined && connection.isConnected !== currentState.isConnected;

  if (accountChanged || tokenChanged || connectionStatusChanged) {
    connectionRevision++;
    apiKeyRequestRevision++;
    isFetchingApiKeys.set(false);
  }

  if (connection.user !== undefined || connection.token !== undefined) {
    const newUser = connection.user !== undefined ? connection.user : currentState.user;
    const newToken = connection.token !== undefined ? connection.token : currentState.token;
    connection.isConnected = connection.isConnected ?? !!(newUser && newToken);
  }

  if (connection.selectedProjectId !== undefined) {
    if (connection.selectedProjectId !== currentState.selectedProjectId) {
      connection.credentials = undefined;
    }

    if (connection.selectedProjectId && currentState.stats?.projects) {
      const selectedProject = currentState.stats.projects.find(
        (project) => project.id === connection.selectedProjectId,
      );

      if (selectedProject) {
        connection.project = selectedProject;
      } else {
        connection.project = {
          id: connection.selectedProjectId,
          name: `Project ${connection.selectedProjectId.substring(0, 8)}...`,
          region: 'unknown',
          organization_id: '',
          status: 'active',
          created_at: new Date().toISOString(),
        };
      }
    } else if (connection.selectedProjectId === '') {
      connection.project = undefined;
      connection.credentials = undefined;
    }
  }

  const newState = { ...currentState, ...connection };
  supabaseConnection.set(newState);

  /*
   * Always save the connection state to localStorage to persist across chats
   */
  if (connection.user || connection.token || connection.selectedProjectId !== undefined || connection.credentials) {
    storage?.setItem('supabase_connection', JSON.stringify(newState));

    if (newState.credentials) {
      storage?.setItem('supabaseCredentials', JSON.stringify(newState.credentials));
    } else {
      storage?.removeItem('supabaseCredentials');
    }
  } else {
    storage?.removeItem('supabase_connection');
    storage?.removeItem('supabaseCredentials');
  }
}

export async function initializeSupabaseConnection() {
  const revision = connectionRevision;
  const currentConnection = supabaseConnection.get();

  if (currentConnection.token) {
    try {
      await fetchSupabaseStats(currentConnection.token, revision);
      return;
    } catch (error) {
      const status = (error as Error & { status?: number }).status;

      if (revision !== connectionRevision) {
        return;
      }

      if (status !== 401 && status !== 403) {
        console.error('Could not revalidate the saved Supabase connection:', error);
        return;
      }

      updateSupabaseConnection({
        user: null,
        token: '',
        stats: undefined,
        selectedProjectId: '',
        isConnected: false,
        project: undefined,
        credentials: undefined,
      });

      return;
    }
  }

  try {
    const response = await fetch('/api/supabase-user');

    if (revision !== connectionRevision) {
      return;
    }

    if (response.ok) {
      const data = (await response.json()) as { user: SupabaseUser | null; projects: SupabaseProject[] };

      if (revision !== connectionRevision) {
        return;
      }

      const user = data.user ??
        currentConnection.user ?? {
          id: 'supabase-account',
          email: '',
          role: 'Admin',
          created_at: '',
          last_sign_in_at: '',
        };

      const accountChanged = currentConnection.user?.id && currentConnection.user.id !== user.id;
      updateSupabaseConnection({
        user,
        token: '',
        isConnected: true,
        stats: { projects: data.projects, totalProjects: data.projects.length },
        ...(accountChanged ? { selectedProjectId: '', credentials: undefined } : {}),
      });

      return;
    }

    if (response.status !== 401 && response.status !== 403) {
      console.error(`Could not revalidate server Supabase connection (${response.status})`);
      return;
    }
  } catch (error) {
    if (revision !== connectionRevision) {
      return;
    }

    console.error('Failed to revalidate Supabase connection:', error);

    return;
  }

  updateSupabaseConnection({
    user: null,
    token: '',
    stats: undefined,
    selectedProjectId: '',
    isConnected: false,
    project: undefined,
    credentials: undefined,
  });
}

export async function fetchSupabaseStats(token: string, expectedRevision?: number) {
  const revision = expectedRevision ?? connectionRevision;
  isFetchingStats.set(true);

  try {
    // Use the internal API route instead of direct Supabase API call
    const response = await fetch('/api/supabase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token,
      }),
    });

    if (!response.ok) {
      const error = new Error(`Failed to fetch projects (${response.status})`) as Error & { status: number };
      error.status = response.status;
      throw error;
    }

    const data = (await response.json()) as any;

    if (revision !== connectionRevision) {
      return;
    }

    updateSupabaseConnection({
      user: data.user,
      stats: data.stats,
    });
  } catch (error) {
    console.error('Failed to fetch Supabase stats:', error);
    throw error;
  } finally {
    isFetchingStats.set(false);
  }
}

export async function fetchProjectApiKeys(projectId: string, token: string) {
  const requestRevision = ++apiKeyRequestRevision;
  isFetchingApiKeys.set(true);

  try {
    const response = await fetch('/api/supabase/variables', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectId,
        token,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch API keys');
    }

    const data = (await response.json()) as any;
    const apiKeys = data.apiKeys;

    const anonKey = apiKeys.find((key: SupabaseApiKey) => key.name === 'anon' || key.name === 'public');

    if (requestRevision !== apiKeyRequestRevision) {
      return null;
    }

    if (anonKey) {
      const supabaseUrl = `https://${projectId}.supabase.co`;

      updateSupabaseConnection({
        credentials: {
          anonKey: anonKey.api_key,
          supabaseUrl,
        },
      });

      return { anonKey: anonKey.api_key, supabaseUrl };
    }

    return null;
  } catch (error) {
    console.error('Failed to fetch project API keys:', error);
    throw error;
  } finally {
    if (requestRevision === apiKeyRequestRevision) {
      isFetchingApiKeys.set(false);
    }
  }
}
