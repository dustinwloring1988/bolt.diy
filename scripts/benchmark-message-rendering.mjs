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

    const container = document.querySelector('#messages');
    const messages10 = createMessages(10);
    const messages50 = createMessages(50);
    const workloads = {
      10: () => renderMessages(messages10, container),
      50: () => renderMessages(messages50, container),
    };

    for (let index = 0; index < 5; index += 1) {
      workloads[index % 2 === 0 ? 10 : 50]();
      workloads[index % 2 === 0 ? 50 : 10]();
    }

    const samples = Array.from({ length: 25 }, (_, index) => {
      const order = index % 2 === 0 ? [10, 50] : [50, 10];
      const durations = {};

      for (const size of order) {
        const start = performance.now();

        for (let iteration = 0; iteration < 20; iteration += 1) {
          workloads[size]();
        }

        durations[size] = (performance.now() - start) / 20;
      }

      return { order, time10: durations[10], time50: durations[50] };
    });

    const median = (key) => {
      const durations = samples.map((sample) => sample[key]).sort((left, right) => left - right);
      return durations[Math.floor(durations.length / 2)];
    };

    return { time10: median('time10'), time50: median('time50'), samples };
  });

  if (!Number.isFinite(timings.time10) || !Number.isFinite(timings.time50)) {
    throw new Error('Browser render benchmark returned a non-finite duration.');
  }

  console.log(`Chromium median render (10 messages): ${timings.time10.toFixed(4)}ms`);
  console.log(`Chromium median render (50 messages): ${timings.time50.toFixed(4)}ms`);
  console.log(`Interleaved raw samples: ${JSON.stringify(timings.samples)}`);
} finally {
  await browser.close();
}
