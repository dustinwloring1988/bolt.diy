import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body><main id="messages"></main></body></html>');

  const timings = await page.evaluate(() => {
    const createMessages = (count) =>
      Array.from({ length: count }, (_, index) => ({
        id: `msg-${index}`,
        content: `This is message number ${index} with some content.`,
      }));

    const renderMessages = (messages, container) => {
      const fragment = document.createDocumentFragment();

      for (const message of messages) {
        const element = document.createElement('div');
        element.textContent = message.content;
        element.setAttribute('data-message-id', message.id);
        fragment.append(element);
      }

      container.replaceChildren(fragment);
      container.getBoundingClientRect();
    };

    const medianDuration = (operation, iterations = 20, samples = 25) => {
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
    };

    const container = document.querySelector('#messages');
    const messages10 = createMessages(10);
    const messages50 = createMessages(50);
    const time10 = medianDuration(() => renderMessages(messages10, container));
    const time50 = medianDuration(() => renderMessages(messages50, container));

    return { time10, time50 };
  });

  if (!Number.isFinite(timings.time10) || !Number.isFinite(timings.time50)) {
    throw new Error('Browser render benchmark returned a non-finite duration.');
  }

  console.log(`Chromium median render (10 messages): ${timings.time10.toFixed(4)}ms`);
  console.log(`Chromium median render (50 messages): ${timings.time50.toFixed(4)}ms`);
} finally {
  await browser.close();
}
