import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { updateConfig, checkServersAvailabilities, close } = vi.hoisted(() => ({
  updateConfig: vi.fn(async () => ({})),
  checkServersAvailabilities: vi.fn(async () => ({})),
  close: vi.fn(async () => undefined),
}));

vi.mock('~/lib/services/mcpService', async () => {
  const schemas = await import('../../app/lib/services/mcpConfig');

  class MCPService {
    static getInstance() {
      return new MCPService();
    }

    updateConfig = updateConfig;
    checkServersAvailabilities = checkServersAvailabilities;
    close = close;
  }

  return { ...schemas, MCPService, sanitizeMcpServerTools: (tools: unknown) => tools };
});

import { action as updateAction } from '../../app/routes/api.mcp-update-config';
import { action as authAction } from '../../app/routes/api.mcp-auth';
import { action as checkAction, loader as checkLoader } from '../../app/routes/api.mcp-check';
import { action as chatAction } from '../../app/routes/api.chat';

const adminToken = 'test-administrator-token-with-enough-entropy';
const commandConfig = { mcpServers: { test: { type: 'stdio', command: 'untrusted-command' } } };

function args(config: unknown, token?: string, env: object = { MCP_CONFIG_TOKEN: adminToken }) {
  return {
    request: new Request('https://example.test/api/mcp-update-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-MCP-Config-Token': token } : {}) },
      body: JSON.stringify(config),
    }),
    context: { cloudflare: { env } },
  } as any;
}

describe('MCP administrator authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', webcrypto);
    vi.stubEnv('MCP_CONFIG_TOKEN', '');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('disables MCP when no server token is configured', async () => {
    const response = await updateAction(args(commandConfig, adminToken, {}));
    expect(response.status).toBe(503);
    expect(updateConfig).not.toHaveBeenCalled();
  });

  it.each([undefined, 'incorrect-token'])('rejects unauthorized command configuration (%s)', async (token) => {
    const response = await updateAction(args(commandConfig, token));
    expect(response.status).toBe(401);
    expect(updateConfig).not.toHaveBeenCalled();
  });

  it('rejects unauthorized private-network URL configuration before contacting a transport', async () => {
    const response = await updateAction(args({ mcpServers: { test: { type: 'sse', url: 'http://127.0.0.1/sse' } } }));
    expect(response.status).toBe(401);
    expect(updateConfig).not.toHaveBeenCalled();
  });

  it('rejects command configuration sent through chat before creating clients', async () => {
    const response = await chatAction(args({ messages: [], mcpConfig: commandConfig }));
    expect(response.status).toBe(401);
    expect(updateConfig).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated personal-server checks before creating clients', async () => {
    const response = await checkAction(args({ mcpServers: { posthog: commandConfig.mcpServers.test } }));
    expect(response.status).toBe(401);
    expect(checkServersAvailabilities).not.toHaveBeenCalled();
    expect(updateConfig).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated GET checks before reconnecting shared servers', async () => {
    const requestArgs = args({});
    requestArgs.request = new Request('https://example.test/api/mcp-check');
    const response = await checkLoader(requestArgs);
    expect(response.status).toBe(401);
    expect(checkServersAvailabilities).not.toHaveBeenCalled();
  });

  it('allows an administrator to configure servers', async () => {
    const response = await updateAction(args(commandConfig, adminToken));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(updateConfig).toHaveBeenCalledWith(commandConfig);
  });

  it('exchanges the administrator secret for an HttpOnly session that authorizes same-origin requests', async () => {
    const loginArgs = args({}, adminToken);
    loginArgs.request = new Request('https://example.test/api/mcp-auth', {
      method: 'POST',
      headers: { 'X-MCP-Config-Token': adminToken },
    });
    const login = await authAction(loginArgs);
    expect(login.status).toBe(200);
    const setCookie = login.headers.get('Set-Cookie')!;
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Secure');
    expect(setCookie).not.toContain(adminToken);

    const authenticatedArgs = args(commandConfig);
    authenticatedArgs.request = new Request('https://example.test/api/mcp-update-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: setCookie.split(';')[0],
        Origin: 'https://example.test',
      },
      body: JSON.stringify(commandConfig),
    });
    const configured = await updateAction(authenticatedArgs);
    expect(configured.status).toBe(200);
  });

  it('rejects an MCP session cookie on a cross-origin mutation', async () => {
    const loginArgs = args({}, adminToken);
    loginArgs.request = new Request('https://example.test/api/mcp-auth', {
      method: 'POST',
      headers: { 'X-MCP-Config-Token': adminToken },
    });
    const login = await authAction(loginArgs);
    const cookie = login.headers.get('Set-Cookie')!.split(';')[0];
    const requestArgs = args(commandConfig);
    requestArgs.request = new Request('https://example.test/api/mcp-update-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'https://attacker.test' },
      body: JSON.stringify(commandConfig),
    });
    const response = await updateAction(requestArgs);
    expect(response.status).toBe(401);
    expect(updateConfig).not.toHaveBeenCalled();
  });

  it('rejects malformed authorized configuration without updating the service', async () => {
    const response = await updateAction(args({ mcpServers: { test: {} } }, adminToken));
    expect(response.status).toBe(400);
    expect(updateConfig).not.toHaveBeenCalled();
  });
});
