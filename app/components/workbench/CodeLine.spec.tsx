import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('~/lib/stores/workbench', () => ({ workbenchStore: {} }));
import { CodeLine } from './DiffView';

describe('DiffView CodeLine fallback', () => {
  it('renders source strings as text when syntax highlighting is unavailable', () => {
    const maliciousText = '<img src=x onerror=alert(1)>';
    const block = {
      lineNumber: 0,
      content: maliciousText,
      type: 'unchanged' as const,
    };

    const { container } = render(
      <CodeLine
        lineNumber={0}
        content={maliciousText}
        type="unchanged"
        highlighter={null}
        language="typescript"
        block={block}
        theme="dark"
      />,
    );

    expect(screen.getByText(maliciousText)).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders changed fragments as text when syntax highlighting is unavailable', () => {
    const maliciousText = '<script>alert(1)</script>';
    const block = {
      lineNumber: 0,
      content: maliciousText,
      type: 'added' as const,
      charChanges: [{ value: maliciousText, type: 'added' as const }],
    };

    const { container } = render(
      <CodeLine
        lineNumber={0}
        content={maliciousText}
        type="added"
        highlighter={null}
        language="typescript"
        block={block}
        theme="dark"
      />,
    );

    expect(screen.getByText(maliciousText)).toBeTruthy();
    expect(container.querySelector('script')).toBeNull();
  });
});
