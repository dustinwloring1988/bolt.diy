import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const port = Number(process.env.PROFILE_PORT || 5188);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PROFILE_PORT must be an integer between 1 and 65535');
}

const baseUrl = `http://127.0.0.1:${port}`;
const outputDir = resolve(process.env.PROFILE_OUTPUT_DIR || 'performance-profiles');
const timestamp = new Date().toISOString().replaceAll(':', '-');
const tracePath = resolve(outputDir, `profile-${timestamp}.trace.json`);
const summaryPath = resolve(outputDir, `profile-${timestamp}.summary.json`);

let server;
let browser;

async function isServerReady() {
  try {
    await fetch(baseUrl, { signal: AbortSignal.timeout(1_000) });
    return true;
  } catch {
    return false;
  }
}

let stoppingServer;

function stopServer() {
  if (!server || server.exitCode !== null) {
    return Promise.resolve();
  }

  if (stoppingServer) {
    return stoppingServer;
  }

  stoppingServer = new Promise((resolveStop) => {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      killer.once('close', resolveStop);
      killer.once('error', resolveStop);

      return;
    }

    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      server.kill('SIGTERM');
    }

    server.once('close', resolveStop);

    const timeout = setTimeout(resolveStop, 3_000);
    timeout.unref();
  });

  return stoppingServer;
}

async function startDevServer() {
  if (await isServerReady()) {
    throw new Error(`A server is already responding at ${baseUrl}. Stop it or choose another PROFILE_PORT.`);
  }

  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  server = spawn(command, ['run', 'dev', '--host', '127.0.0.1', '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    windowsHide: true,
    detached: process.platform !== 'win32',
  });

  let serverOutput = '';
  server.stdout.on('data', (chunk) => {
    serverOutput = `${serverOutput}${chunk}`.slice(-8_000);
  });
  server.stderr.on('data', (chunk) => {
    serverOutput = `${serverOutput}${chunk}`.slice(-8_000);
  });

  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (await isServerReady()) {
      return;
    }

    if (server.exitCode !== null) {
      throw new Error(`Development server exited with ${server.exitCode}.\n${serverOutput}`);
    }

    await delay(1_000);
  }

  throw new Error(`Timed out waiting for the dev server at ${baseUrl}.\n${serverOutput}`);
}

async function readTrace(session, stream) {
  let output = '';
  let eof = false;

  while (!eof) {
    const chunk = await session.send('IO.read', { handle: stream, size: 1_048_576 });
    output += chunk.data;
    eof = chunk.eof;
  }

  await session.send('IO.close', { handle: stream });

  return output;
}

try {
  await mkdir(dirname(tracePath), { recursive: true });
  await startDevServer();
  browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const pageErrors = [];
  await page.addInitScript(() => {
    localStorage.setItem('bolt_onboarding_complete', 'true');
    window.__BROWSER_LONG_TASKS__ = [];

    if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      const observer = new PerformanceObserver((list) => {
        window.__BROWSER_LONG_TASKS__.push(
          ...list.getEntries().map((entry) => ({ startTime: entry.startTime, duration: entry.duration })),
        );
      });
      observer.observe({ type: 'longtask', buffered: true });
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const session = await context.newCDPSession(page);
  await session.send('Tracing.start', {
    categories:
      'devtools.timeline,v8.execute,blink.user_timing,loading,disabled-by-default-devtools.timeline,disabled-by-default-v8.cpu_profiler',
    transferMode: 'ReturnAsStream',
  });

  const startedAt = Date.now();
  await page.goto(`${baseUrl}/?profile=1`, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  let composerProfiled = false;

  try {
    const composer = page.locator('textarea').first();
    await composer.waitFor({ state: 'visible', timeout: 60_000 });
    await composer.fill('Performance profiling sample: responsive app with a searchable list.');
    await page.waitForTimeout(1_000);
    await composer.fill('');
    composerProfiled = true;
  } catch {
    // Keep the navigation profile even when the first page has no chat composer.
  }

  await page.waitForTimeout(2_000);

  const runtimeSummary = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];

    const resources = performance
      .getEntriesByType('resource')
      .map((entry) => ({ name: entry.name, duration: entry.duration, transferSize: entry.transferSize }))
      .sort((left, right) => right.duration - left.duration)
      .slice(0, 30);

    const browserLongTasks = window.__BROWSER_LONG_TASKS__ ?? [];
    const metrics = window.__BOLT_PERFORMANCE__?.monitor?.getMetrics?.() ?? [];

    const appLongTasks = metrics
      .filter((metric) => metric.name === 'main-thread:long-task')
      .map((metric) => ({ startTime: metric.metadata?.startTime, duration: metric.duration }));

    return {
      navigation: navigation
        ? {
            domContentLoaded: navigation.domContentLoadedEventEnd,
            domInteractive: navigation.domInteractive,
            loadEventEnd: navigation.loadEventEnd,
            responseStart: navigation.responseStart,
            transferSize: navigation.transferSize,
          }
        : null,
      resources,
      longTasks: browserLongTasks.length > 0 ? browserLongTasks : appLongTasks,
      browserLongTasks,
      appLongTasks,
      appMetrics: metrics,
    };
  });

  let completionTimeout;
  let onTracingComplete;

  const completion = new Promise((resolveCompletion, rejectCompletion) => {
    onTracingComplete = (result) => resolveCompletion(result);
    session.once('Tracing.tracingComplete', onTracingComplete);
    completionTimeout = setTimeout(
      () => rejectCompletion(new Error('Timed out waiting for tracing to complete.')),
      30_000,
    );
  });

  let traceResult;

  try {
    await session.send('Tracing.end');
    traceResult = await completion;
  } finally {
    clearTimeout(completionTimeout);
    session.removeListener('Tracing.tracingComplete', onTracingComplete);
  }

  const trace = await readTrace(session, traceResult.stream);

  const summary = {
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date().toISOString(),
    url: `${baseUrl}/?profile=1`,
    composerProfiled,
    pageErrors,
    runtime: runtimeSummary,
    tracePath,
  };

  await Promise.all([writeFile(tracePath, trace), writeFile(summaryPath, JSON.stringify(summary, null, 2))]);

  console.log(`Browser performance trace: ${tracePath}`);
  console.log(`Profile summary: ${summaryPath}`);
  console.log(`Composer interaction captured: ${composerProfiled ? 'yes' : 'no'}`);
  console.log(`Main-thread long tasks observed: ${runtimeSummary.longTasks.length}`);
  console.log(`Browser errors observed: ${pageErrors.length}`);

  await context.close();
  await browser.close();
  browser = undefined;
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
} finally {
  if (browser) {
    await browser.close().catch(() => undefined);
  }

  await stopServer();
}
