import { describe, expect, it } from 'vitest';
import { loader } from '../../app/routes/api.export-api-keys';

describe('API key export route', () => {
  it('exports only keys configured in the requesting browser', async () => {
    const request = new Request('https://example.test/api/export-api-keys', {
      headers: { Cookie: `apiKeys=${encodeURIComponent(JSON.stringify({ openai: 'user-key' }))}` },
    });

    const response = (await loader({ request } as any)) as Response;

    expect(await response.json()).toEqual({ openai: 'user-key' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('does not export server environment keys when no browser keys are configured', async () => {
    const response = (await loader({
      request: new Request('https://example.test/api/export-api-keys'),
    } as any)) as Response;

    expect(await response.json()).toEqual({});
  });
});
