import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const highlightCodeMock = vi.hoisted(() => vi.fn());
vi.mock('~/utils/syntax-highlighter-client', () => ({ highlightCode: highlightCodeMock }));

import { CodeBlock } from './CodeBlock';

afterEach(() => {
  cleanup();
  highlightCodeMock.mockReset();
});

describe('CodeBlock', () => {
  it('uses the worker client and ignores stale highlight results', async () => {
    let resolveOld!: (html: string) => void;
    let resolveNew!: (html: string) => void;
    highlightCodeMock
      .mockImplementationOnce(() => new Promise<string>((resolve) => (resolveOld = resolve)))
      .mockImplementationOnce(() => new Promise<string>((resolve) => (resolveNew = resolve)));

    const view = render(<CodeBlock code="old" language="javascript" />);
    view.rerender(<CodeBlock code="new" language="javascript" />);

    expect(highlightCodeMock).toHaveBeenCalledTimes(2);
    expect(highlightCodeMock).toHaveBeenLastCalledWith('new', 'javascript', 'dark-plus');

    await act(async () => resolveNew('<pre><code>new result</code></pre>'));
    await act(async () => resolveOld('<pre><code>old result</code></pre>'));

    expect(screen.getByText('new result')).toBeTruthy();
    expect(screen.queryByText('old result')).toBeNull();
  });
});
