import { chromium } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const benchmarkPath = '/__message-render-benchmark';
const vite = await createServer({
  appType: 'custom',
  mode: 'test',
  server: { host: '127.0.0.1', port: 0, strictPort: false },
  plugins: [
    react(),
    {
      name: 'message-render-benchmark-page',
      configureServer(server) {
        server.middlewares.use(benchmarkPath, (_request, response) => {
          response.setHeader('Content-Type', 'text/html');
          response.end(
            '<!doctype html><html><body><main id="root"></main><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;</script><script type="module" src="/scripts/message-render-benchmark.tsx"></script></body></html>',
          );
        });
      },
    },
  ],
});

await vite.listen();
const address = vite.httpServer.address();

if (!address || typeof address === 'string') {
  await vite.close();
  throw new Error('Could not determine the Vite benchmark server address.');
}

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}${benchmarkPath}`);
  await page.waitForFunction(() => typeof window.runMessageRenderBenchmark === 'function');

  const timings = await page.evaluate(() => {
    const workloads = [10, 50];

    for (let index = 0; index < 5; index += 1) {
      window.runMessageRenderBenchmark(workloads[index % workloads.length]);
    }

    const samples = Array.from({ length: 25 }, (_, sampleIndex) => {
      const order = sampleIndex % 2 === 0 ? workloads : [...workloads].reverse();
      const durations = {};

      for (const size of order) {
        let elapsed = 0;

        for (let iteration = 0; iteration < 10; iteration += 1) {
          elapsed += window.runMessageRenderBenchmark(size);
        }

        durations[size] = elapsed / 10;
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
    throw new Error('Browser message-component benchmark returned a non-finite duration.');
  }

  console.log(`Chromium median Bolt message render (10 messages): ${timings.time10.toFixed(4)}ms`);
  console.log(`Chromium median Bolt message render (50 messages): ${timings.time50.toFixed(4)}ms`);
  console.log(`Interleaved raw samples: ${JSON.stringify(timings.samples)}`);
} finally {
  await browser.close();
  await vite.close();
}
