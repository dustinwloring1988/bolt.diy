import { describe, expect, it } from 'vitest';
import { getDirectoryEntryPaths } from './files';

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
