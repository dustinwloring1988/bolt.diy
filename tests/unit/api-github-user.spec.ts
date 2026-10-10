import { afterEach, describe, expect, it, vi } from 'vitest';
import { action, loader } from '../../app/routes/api.github-user';

describe('GitHub account credential isolation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('never exports deployment credentials to a browser without its own token', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'server-process-secret');
    const response = await action({
      request: new Request('https://example.test/api/github-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_token' }),
      }),
      context: { cloudflare: { env: { GITHUB_TOKEN: 'server-binding-secret' } } },
    } as any);
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain('secret');
  });

  it('exports only the requesting browser token without caching it', async () => {
    const response = await action({
      request: new Request('https://example.test/api/github-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `apiKeys=${encodeURIComponent(JSON.stringify({ GITHUB_API_KEY: 'browser-token' }))}`,
        },
        body: JSON.stringify({ action: 'get_token' }),
      }),
    } as any);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token: 'browser-token' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('does not use server credentials to read account data for an anonymous browser', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('GITHUB_TOKEN', 'server-process-secret');
    const response = await loader({
      request: new Request('https://example.test/api/github-user'),
      context: { cloudflare: { env: { GITHUB_TOKEN: 'server-binding-secret' } } },
    } as any);
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
