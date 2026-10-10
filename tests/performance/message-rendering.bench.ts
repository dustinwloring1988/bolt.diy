/**
 * Message content and list operation benchmarks.
 * Browser rendering is measured with: pnpm run benchmarks:render
 */

import { describe, expect, it } from 'vitest';

function medianDuration(operation: () => void, iterations = 20, samples = 25): number {
  for (let index = 0; index < 5; index += 1) {
    operation();
  }

  const durations = Array.from({ length: samples }, () => {
    const start = performance.now();

    for (let iteration = 0; iteration < iterations; iteration += 1) {
      operation();
    }

    return (performance.now() - start) / iterations;
  }).sort((left, right) => left - right);

  return durations[Math.floor(durations.length / 2)];
}

describe('Message Content Processing', () => {
  const content = `
Here's some code:

\`\`\`javascript
function example() {
  console.log("Hello");
  return 42;
}
\`\`\`

And more text after.
  `.trim();

  it('reports median code extraction time', () => {
    const codeBlockRegex = /\u0060\u0060\u0060(\w+)?\n([\s\S]*?)\u0060\u0060\u0060/g;
    const processContent = () => {
      const blocks: { language: string; code: string }[] = [];
      let match: RegExpExecArray | null;


      while ((match = codeBlockRegex.exec(content)) !== null) {
        blocks.push({ language: match[1] || 'plaintext', code: match[2] });
      }

      codeBlockRegex.lastIndex = 0;

      return blocks;
    };

    const duration = medianDuration(() => processContent());

    console.log(`Median code extraction: ${duration.toFixed(4)}ms`);
    expect(processContent()).toHaveLength(1);
  });
});

describe('Message List Operations', () => {
  const messages = Array.from({ length: 1_000 }, (_, index) => ({
    id: `msg-${index}`,
    role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
    content: `This is message number ${index} with some content.`,
    timestamp: Date.now() + index,
  }));

  it('reports median append and update timings for a 1000 message list', () => {
    const appendTime = medianDuration(() => [...messages, { id: 'msg-1001', role: 'user' as const, content: 'New', timestamp: Date.now() }]);

    const updateTime = medianDuration(() =>
      messages.map((message) => (message.id === 'msg-500' ? { ...message, content: 'Updated content' } : message)),
    );

    console.log(`Median append to 1000 items: ${appendTime.toFixed(4)}ms`);
    console.log(`Median update in 1000 items: ${updateTime.toFixed(4)}ms`);
    expect(messages).toHaveLength(1_000);
  });
});
