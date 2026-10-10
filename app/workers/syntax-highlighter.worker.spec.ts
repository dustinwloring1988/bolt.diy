import { afterEach, describe, expect, it, vi } from 'vitest';

const createHighlighterMock = vi.hoisted(() => vi.fn());
vi.mock('shiki', () => ({ createHighlighter: createHighlighterMock }));

type WorkerHandler = (event: { data: { id: string; code: string; language: string; theme?: string } }) => Promise<void>;

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  createHighlighterMock.mockReset();
});

describe('syntax highlighter worker', () => {
  it('responds to all waiting requests when initialization fails', async () => {
    let rejectInitialization!: (error: Error) => void;
    createHighlighterMock.mockImplementation(
      () => new Promise((_resolve, reject) => (rejectInitialization = reject)),
    );

    let handler!: WorkerHandler;
    const postMessage = vi.fn();
    vi.stubGlobal('self', {
      addEventListener: (_type: string, callback: WorkerHandler) => {
        handler = callback;
      },
      postMessage,
    });

    await import('./syntax-highlighter.worker');
    const first = handler({ data: { id: 'first', code: 'one', language: 'javascript' } });
    const second = handler({ data: { id: 'second', code: 'two', language: 'typescript' } });
    rejectInitialization(new Error('init failed'));
    await Promise.all([first, second]);

    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(postMessage.mock.calls.map(([message]) => message.id)).toEqual(['first', 'second']);
    expect(postMessage.mock.calls.every(([message]) => Boolean(message.error))).toBe(true);
  });

  it('does not try to load Shiki grammar for plaintext special languages', async () => {
    const highlighter = {
      getLoadedLanguages: vi.fn(() => []),
      loadLanguage: vi.fn(),
      getLoadedThemes: vi.fn(() => ['dark-plus', 'light-plus']),
      loadTheme: vi.fn(),
      codeToHtml: vi.fn(() => '<pre><code>plain</code></pre>'),
    };
    createHighlighterMock.mockResolvedValue(highlighter);

    let handler!: WorkerHandler;
    const postMessage = vi.fn();
    vi.stubGlobal('self', {
      addEventListener: (_type: string, callback: WorkerHandler) => {
        handler = callback;
      },
      postMessage,
    });

    await import('./syntax-highlighter.worker');
    await handler({ data: { id: 'plain', code: 'hello', language: 'plaintext' } });

    expect(highlighter.loadLanguage).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({ id: 'plain', html: '<pre><code>plain</code></pre>' });
  });
});
