import { afterEach, describe, expect, it, vi } from 'vitest';
import { selectStarterTemplate } from './selectStarterTemplate';
import type { ProviderInfo } from '~/types/model';

const provider = { name: 'OpenAI' } as ProviderInfo;

describe('selectStarterTemplate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to blank when the selection request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));

    await expect(selectStarterTemplate({ message: 'Build a todo app', model: 'test', provider })).resolves.toEqual({
      template: 'blank',
      title: '',
    });
  });

  it('falls back to blank for an unsuccessful response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(selectStarterTemplate({ message: 'Build a todo app', model: 'test', provider })).resolves.toEqual({
      template: 'blank',
      title: '',
    });
  });
});
