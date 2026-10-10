import { describe, expect, it } from 'vitest';
import type { WebContainer } from '@webcontainer/api';
import { getDirectoryEntryPaths, FilesStore } from './files';

describe('getDirectoryEntryPaths', () => {
  it('returns the directory and descendants without matching sibling prefixes', () => {
    const files = {
      src: { type: 'folder' as const },
      'src/components': { type: 'folder' as const },
      'src/components/App.tsx': { type: 'file' as const, content: '', isBinary: false },
      'src/components-old/Keep.tsx': { type: 'file' as const, content: '', isBinary: false },
    };

    expect(getDirectoryEntryPaths(files, 'src/components').sort()).toEqual([
      'src/components',
      'src/components/App.tsx',
    ]);
  });
});

describe('FilesStore.createFile', () => {
  it('counts a newly created file once, including when the watcher already reported it', async () => {
    let onEvents: ((events: any) => void) | undefined;
    const webcontainer = {
      workdir: '/home/project',
      fs: { readdir: async () => [], mkdir: async () => undefined, writeFile: async () => undefined },
      internal: { watchPaths: (_options: unknown, listener: (events: any) => void) => (onEvents = listener) },
    } as unknown as WebContainer;
    const store = new FilesStore(Promise.resolve(webcontainer));

    await store.createFile('/home/project/src/new.ts', 'content');
    expect(store.filesCount).toBe(1);

    onEvents?.([{ type: 'add_file', path: '/home/project/src/new.ts', buffer: new TextEncoder().encode('content') }]);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(store.filesCount).toBe(1);

    await store.createFile('/home/project/src/new.ts', 'updated');
    expect(store.filesCount).toBe(1);
  });
});
