import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { AssistantMessage } from '~/components/chat/AssistantMessage';
import { UserMessage } from '~/components/chat/UserMessage';

declare global {
  interface Window {
    runMessageRenderBenchmark: (messageCount: number) => number;
  }
}

const root = createRoot(document.getElementById('root')!);

window.runMessageRenderBenchmark = (messageCount) => {
  const messages = Array.from({ length: messageCount }, (_, index) => {
    const content = `Message ${index}: Bolt renders Markdown **content**, code blocks, and ordinary chat text.`;
    const parts = [{ type: 'text' as const, text: content }];

    return index % 2 === 0 ? (
      <UserMessage key={`user-${index}`} content={content} parts={parts} />
    ) : (
      <AssistantMessage
        key={`assistant-${index}`}
        content={content}
        messageId={`assistant-${index}`}
        parts={parts}
        addToolResult={() => undefined}
      />
    );
  });

  const start = performance.now();

  flushSync(() => root.render(<div>{messages}</div>));
  document.getElementById('root')!.getBoundingClientRect();

  return performance.now() - start;
};
