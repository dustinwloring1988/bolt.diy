import { afterEach, describe, expect, it, vi } from 'vitest';
import { loader } from '../../app/routes/api.git-proxy.$';

describe('Git proxy route', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('rejects targets outside supported Git hosts without making a request', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const response = (await loader({
      request: new Request('https://app.test/api/git-proxy/github.com.attacker.test/repo'),
      params: { '*': 'github.com.attacker.test/repo' },
    } as any)) as Response;

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses manual redirect handling for an allowed Git host', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'));
    globalThis.fetch = fetchMock;

    const response = (await loader({
      request: new Request('https://app.test/api/git-proxy/github.com/owner/repo.git/info/refs'),
      params: { '*': 'github.com/owner/repo.git/info/refs' },
    } as any)) as Response;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://github.com/owner/repo.git/info/refs',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('allows additional explicitly configured public Git hosts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'));
    globalThis.fetch = fetchMock;

    const response = (await loader({
      request: new Request('https://app.test/api/git-proxy/git.example.com/owner/repo.git/info/refs'),
      params: { '*': 'git.example.com/owner/repo.git/info/refs' },
      context: { cloudflare: { env: { GIT_PROXY_ALLOWED_HOSTS: 'git.example.com' } } },
    } as any)) as Response;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://git.example.com/owner/repo.git/info/refs',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('follows a safe same-origin repository rename redirect', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { Location: '/new-owner/repo.git/info/refs' } }))
      .mockResolvedValueOnce(new Response('ok'));
    globalThis.fetch = fetchMock;

    const response = (await loader({
      request: new Request('https://app.test/api/git-proxy/github.com/old-owner/repo.git/info/refs'),
      params: { '*': 'github.com/old-owner/repo.git/info/refs' },
    } as any)) as Response;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://github.com/new-owner/repo.git/info/refs',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('blocks redirects without following their destination', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/private' } }));
    globalThis.fetch = fetchMock;

    const response = (await loader({
      request: new Request('https://app.test/api/git-proxy/github.com/owner/repo.git/info/refs'),
      params: { '*': 'github.com/owner/repo.git/info/refs' },
    } as any)) as Response;

    expect(response.status).toBe(502);
    expect(response.headers.get('location')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
