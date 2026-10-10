import { act, renderHook, waitFor } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resetWorkbench, mkdir, writeFile, getNextId, setMessages, setSnapshot } = vi.hoisted(() => ({
  resetWorkbench: vi.fn<() => Promise<void>>(async () => undefined),
  mkdir: vi.fn<() => Promise<void>>(async () => undefined),
  writeFile: vi.fn<() => Promise<void>>(async () => undefined),
  getNextId: vi.fn(async () => '3'),
  setMessages: vi.fn(async () => undefined),
  setSnapshot: vi.fn(async () => undefined),
}));

/*
 * `~/lib/stores/workbench` and `~/lib/webcontainer` both read
 * `import.meta.hot.data`, which vitest does not provide. Mocking them keeps the
 * module graph loadable; the workbench is the subject under test here, so its
 * reset is asserted through the spy rather than through its internals.
 */
vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    resetWorkbench,
    files: { get: () => ({}) },
    firstArtifact: undefined,
  },
}));

/*
 * The chat workbench never boots a container under test, so the promise stays
 * pending on purpose.
 */
vi.mock('~/lib/webcontainer', () => ({
  webcontainer: Promise.resolve({ workdir: '/home/project', fs: { mkdir, writeFile } }),
  webcontainerContext: { loaded: false },
}));

vi.mock('./db', () => ({
  openDatabase: vi.fn(async () => ({})),
  getNextId,
  getUrlId: vi.fn(async () => 'chat-new'),
  setMessages,
  setSnapshot,
  duplicateChat: vi.fn(async () => 'dupe'),
  createChatFromMessages: vi.fn(async () => 'imported'),
  getMessagesByIdRaw: vi.fn(async () => undefined),
  getMessagesByUrlIdRaw: vi.fn(async () => undefined),
}));

/*
 * Persisted chats, keyed by the route that shows them. The record's own id is
 * what identifies a chat, which is deliberately not the same as the route: a
 * chat that was just created gets a numeric id and is then routed to
 * /chat/<urlId>.
 */
const records: Record<string, { id: string; urlId: string }> = {
  'chat-a': { id: '1', urlId: 'chat-a' },
  'chat-b': { id: '2', urlId: 'chat-b' },
  3: { id: '3', urlId: '3' },
};

const snapshots: Record<string, unknown> = {};

vi.mock('./chatCache', () => ({
  getCachedMessages: vi.fn(async (_db: unknown, routeId: string) => {
    const record = records[routeId];
    const messages = snapshots[routeId]
      ? [
          { id: `${routeId}-user`, role: 'user', parts: [{ type: 'text', text: 'hi' }] },
          { id: 'snapshot-message', role: 'assistant', parts: [{ type: 'text', text: 'snapshot' }] },
          { id: `${routeId}-assistant`, role: 'assistant', parts: [{ type: 'text', text: 'hello' }] },
        ]
      : [
          { id: `${routeId}-user`, role: 'user', parts: [{ type: 'text', text: 'hi' }] },
          { id: `${routeId}-assistant`, role: 'assistant', parts: [{ type: 'text', text: 'hello' }] },
        ];

    return {
      id: record?.id ?? routeId,
      urlId: record?.urlId ?? routeId,
      description: routeId,
      messages: messages as UIMessage[],
    };
  }),
  getCachedSnapshot: vi.fn(async (_db: unknown, routeId: string) => snapshots[routeId]),
  invalidateChatCache: vi.fn(),
}));

/*
 * The route the hook believes it is on. `searchParams` is memoised per search
 * string so the effect's dependency behaves the way it does under the router.
 */
let routeId: string | undefined = 'chat-a';
let routeSearch = '';

const searchParamsCache = new Map<string, URLSearchParams>();

/*
 * `navigate` is an effect dependency, so it has to keep its identity across
 * renders the way the router's does.
 */
const navigate = vi.fn();
const setSearchParams = vi.fn();

vi.mock('react-router', () => ({
  useNavigate: () => navigate,
  useLoaderData: () => undefined,
  useParams: () => ({ id: routeId }),
  useSearchParams: () => {
    let params = searchParamsCache.get(routeSearch);

    if (!params) {
      params = new URLSearchParams(routeSearch);
      searchParamsCache.set(routeSearch, params);
    }

    return [params, setSearchParams];
  },
}));

async function importHook() {
  return (await import('./useChatHistory')).useChatHistory;
}

describe('useChatHistory chat switching', () => {
  beforeEach(() => {
    resetWorkbench.mockClear();
    mkdir.mockClear();
    writeFile.mockClear();
    getNextId.mockReset();
    getNextId.mockResolvedValue('3');
    setMessages.mockClear();
    setSnapshot.mockClear();
    Object.keys(snapshots).forEach((key) => delete snapshots[key]);
    routeId = 'chat-a';
    routeSearch = '';
    searchParamsCache.clear();

    /*
     * `openDatabase` bails out when there is no indexedDB, which would send the
     * hook down its "persistence unavailable" path instead of loading a chat.
     */
    vi.stubGlobal('indexedDB', {
      open: () => {
        const request: Record<string, unknown> = {};

        queueMicrotask(() => {
          request.result = {};
          (request.onsuccess as (event: unknown) => void)?.({ target: request });
        });

        return request;
      },
    });
  });

  it('should reset the workbench and the container when another chat is opened', async () => {
    const useChatHistory = await importHook();
    const { rerender, result } = renderHook(() => useChatHistory());

    await waitFor(() => expect(resetWorkbench).toHaveBeenCalledTimes(1));

    routeId = 'chat-b';
    rerender();

    await waitFor(() => expect(resetWorkbench).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.chatChanged).toBe(true));
  });

  it('ignores an older chat load that finishes after navigation to a newer chat', async () => {
    let releaseReset!: () => void;
    resetWorkbench.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseReset = resolve;
        }),
    );

    const useChatHistory = await importHook();
    const { rerender, result } = renderHook(() => useChatHistory());

    await waitFor(() => expect(resetWorkbench).toHaveBeenCalledTimes(1));

    routeId = 'chat-b';
    rerender();
    releaseReset();

    await waitFor(() => expect(result.current.initialMessages[0]?.id).toBe('chat-b-user'));
    expect(result.current.initialMessages.some((message) => message.id.startsWith('chat-a'))).toBe(false);
  });

  it('replays the returning chat snapshot when a delayed reset finishes after A to B to A navigation', async () => {
    const useChatHistory = await importHook();
    const { rerender, result } = renderHook(() => useChatHistory());
    await waitFor(() => expect(result.current.ready).toBe(true));

    let finishBReset!: () => void;
    resetWorkbench.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishBReset = resolve;
        }),
    );
    routeId = 'chat-b';
    rerender();
    await waitFor(() => expect(resetWorkbench).toHaveBeenCalledTimes(2));

    snapshots['chat-a'] = {
      chatIndex: 'snapshot-message',
      files: { '/home/project/src/returning.ts': { type: 'file', content: 'restored', isBinary: false } },
    };
    routeId = 'chat-a';
    rerender();
    finishBReset();

    await waitFor(() =>
      expect(result.current.initialMessages.some((message) => message.id === 'chat-a-assistant')).toBe(true),
    );
    expect(resetWorkbench).toHaveBeenCalledTimes(3);
    expect(writeFile).toHaveBeenCalledWith('/src/returning.ts', 'restored', { encoding: 'utf8' });
  });

  it('waits for snapshot directories and files before exposing loaded messages', async () => {
    const useChatHistory = await importHook();
    const { result, rerender } = renderHook(() => useChatHistory());

    // Let the initial chat load finish before setting up the snapshot route.
    await waitFor(() => expect(result.current.ready).toBe(true));

    let finishWrite!: () => void;
    writeFile.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = resolve;
        }),
    );
    snapshots['chat-b'] = {
      chatIndex: 'snapshot-message',
      files: {
        '/home/project/src': { type: 'folder' },
        '/home/project/src/app.ts': { type: 'file', content: 'export {}', isBinary: false },
      },
    };

    routeId = 'chat-b';
    rerender();

    await waitFor(() => expect(writeFile).toHaveBeenCalledTimes(1));
    expect(result.current.ready).toBe(false);
    expect(result.current.initialMessages).toEqual([]);
    finishWrite();
    await waitFor(() =>
      expect(result.current.initialMessages.some((message) => message.id === 'chat-b-assistant')).toBe(true),
    );
  });

  it('cancels remaining snapshot writes and drains the workbench before entering a fresh chat', async () => {
    const useChatHistory = await importHook();
    const { result, rerender } = renderHook(() => useChatHistory());

    await waitFor(() => expect(result.current.ready).toBe(true));

    let finishWrite!: () => void;
    writeFile.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = resolve;
        }),
    );
    snapshots['chat-b'] = {
      chatIndex: 'snapshot-message',
      files: {
        '/home/project/src': { type: 'folder' },
        '/home/project/src/one.ts': { type: 'file', content: 'one', isBinary: false },
        '/home/project/src/two.ts': { type: 'file', content: 'two', isBinary: false },
      },
    };

    routeId = 'chat-b';
    rerender();
    await waitFor(() => expect(writeFile).toHaveBeenCalledTimes(1));

    routeId = undefined;
    rerender();
    expect(result.current.ready).toBe(false);
    finishWrite();

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.initialMessages).toEqual([]);
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(resetWorkbench).toHaveBeenCalledTimes(3);
  });

  it('cancels remaining snapshot writes when the hook unmounts', async () => {
    const useChatHistory = await importHook();
    const { rerender, unmount } = renderHook(() => useChatHistory());

    await waitFor(() => expect(resetWorkbench).toHaveBeenCalledTimes(1));

    let finishWrite!: () => void;
    writeFile.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = resolve;
        }),
    );
    snapshots['chat-b'] = {
      chatIndex: 'snapshot-message',
      files: {
        '/home/project/src': { type: 'folder' },
        '/home/project/src/one.ts': { type: 'file', content: 'one', isBinary: false },
        '/home/project/src/two.ts': { type: 'file', content: 'two', isBinary: false },
      },
    };

    routeId = 'chat-b';
    rerender();
    await waitFor(() => expect(writeFile).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => {
      finishWrite();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(writeFile).toHaveBeenCalledTimes(1);
  });

  it('should not reset the workbench when only the query string changes', async () => {
    const useChatHistory = await importHook();
    const { rerender, result } = renderHook(() => useChatHistory());

    await waitFor(() => expect(resetWorkbench).toHaveBeenCalledTimes(1));

    /*
     * A `?prompt=` navigation re-runs the effect for the same chat. Wiping the
     * workbench there would delete the project the chat is still on.
     */
    routeSearch = 'prompt=make%20a%20todo%20app';
    rerender();

    await waitFor(() => expect(resetWorkbench).toHaveBeenCalledTimes(1));
    expect(result.current.ready).toBe(true);
  });

  it('should reset the workbench and the container when leaving a chat for a fresh one', async () => {
    const useChatHistory = await importHook();
    const { rerender, result } = renderHook(() => useChatHistory());

    await waitFor(() => expect(resetWorkbench).toHaveBeenCalledTimes(1));

    routeId = undefined;
    rerender();

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(resetWorkbench).toHaveBeenCalledTimes(2);

    /*
     * The outgoing chat's parsed output has to go with it, otherwise the next
     * chat's messages are appended to it by index.
     */
    await waitFor(() => expect(result.current.chatChanged).toBe(true));
  });

  it('should not reset again while already on a fresh chat', async () => {
    const useChatHistory = await importHook();

    routeId = undefined;

    const { rerender, result } = renderHook(() => useChatHistory());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(resetWorkbench).not.toHaveBeenCalled();

    routeSearch = 'prompt=make%20a%20todo%20app';
    rerender();

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(resetWorkbench).not.toHaveBeenCalled();
    expect(result.current.chatChanged).toBe(false);
  });

  /*
   * Persisting the first exchange of a new chat moves it to /chat/<id> with
   * history.replaceState, which the router does pick up. The messages, artifacts
   * and files on screen already belong to that chat, so the re-run it triggers
   * must not empty them.
   */
  it('should not reset when the route catches up with the chat just persisted', async () => {
    const useChatHistory = await importHook();

    routeId = undefined;

    const { rerender, result } = renderHook(() => useChatHistory());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(resetWorkbench).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.storeMessageHistory([
        { id: 'new-1', role: 'assistant', content: 'built', parts: [{ type: 'text', text: 'built' }] } as any,
      ]);
    });

    expect(window.location.pathname).toBe('/chat/3');

    // The router re-renders now that it can see the new path.
    routeId = '3';
    rerender();

    await waitFor(() => expect(result.current.initialMessages.length).toBeGreaterThan(0));
    expect(resetWorkbench).not.toHaveBeenCalled();
    expect(result.current.chatChanged).toBe(false);
    expect(result.current.ready).toBe(true);
  });

  it('saves a pending new-chat exchange to its captured ID after navigation changes', async () => {
    let finishIdLookup!: () => void;
    getNextId.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finishIdLookup = () => resolve('3');
        }),
    );

    routeId = undefined;
    const useChatHistory = await importHook();
    const { rerender, result } = renderHook(() => useChatHistory());
    await waitFor(() => expect(result.current.ready).toBe(true));

    const save = result.current.storeMessageHistory([
      {
        id: 'outgoing-message',
        role: 'assistant',
        content: 'outgoing chat',
        parts: [{ type: 'text', text: 'outgoing chat' }],
      },
    ] as any);
    await waitFor(() => expect(getNextId).toHaveBeenCalledTimes(1));

    routeId = 'chat-a';
    rerender();
    await waitFor(() => expect(result.current.initialMessages[0]?.id).toBe('chat-a-user'));
    finishIdLookup();
    await save;

    expect(setMessages).toHaveBeenCalledTimes(1);
    const savedCalls = setMessages.mock.calls as unknown as Array<[unknown, string, UIMessage[]]>;
    expect(savedCalls[0][1]).toBe('3');
    expect(savedCalls[0][2].some((message) => message.id === 'outgoing-message')).toBe(true);
    const snapshotCalls = setSnapshot.mock.calls as unknown as Array<[unknown, string]>;
    expect(snapshotCalls[0][1]).toBe('3');
  });
});
