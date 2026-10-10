#!/usr/bin/env node

/**
 * Electron Development Script
 *
 * This script provides hot-reload development mode for Electron applications.
 * It automatically builds Electron dependencies, starts the Remix development server,
 * and launches the Electron application with hot-reload capabilities.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';

// Get current file directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const REMIX_PORT = 5173;
const CHECK_INTERVAL = 1000;
const MAX_RETRIES = 30;

// Set environment variables
process.env.NODE_ENV = 'development';

console.log('🚀 Starting Electron hot-reload development mode...');
console.log('🔧 Environment:', process.env.NODE_ENV);

let electronProcess = null;
let remixProcess = null;

/**
 * Cleanup function to gracefully shutdown all processes
 */
function cleanup() {
  console.log('\n🛑 Shutting down all processes...');

  if (electronProcess) {
    electronProcess.kill('SIGTERM');
  }

  if (remixProcess) {
    remixProcess.kill('SIGTERM');
  }

  process.exit(0);
}

// Handle process exit signals
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

/**
 * Wait for a server to start on the specified port
 * @param {number} port - Port number to check
 * @param {string} serverName - Name of the server for logging
 * @returns {Promise<void>}
 */
async function waitForServer(port, serverName) {
  const endpoint = `http://127.0.0.1:${port}`;

  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    try {
      await fetch(endpoint, { signal: AbortSignal.timeout(CHECK_INTERVAL) });
      console.log(`✅ ${serverName} started`);

      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL));
    }
  }

  throw new Error(`Timeout waiting for ${serverName} to start`);
}

function spawnPnpm(args, options) {
  const pnpmCli = process.env.npm_execpath;

  if (pnpmCli) {
    return spawn(process.execPath, [pnpmCli, ...args], options);
  }

  return spawn(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args, {
    ...options,
    shell: process.platform === 'win32',
  });
}

/**
 * Build Electron dependencies
 * @returns {Promise<void>}
 */
async function buildElectronDeps() {
  return new Promise((resolve, reject) => {
    const buildProcess = spawnPnpm(['electron:build:deps'], {
      stdio: 'inherit',
      env: { ...process.env },
    });

    buildProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Electron dependencies built successfully');
        resolve();
      } else {
        reject(new Error(`Build failed with exit code: ${code}`));
      }
    });

    buildProcess.on('error', (error) => {
      reject(new Error(`Build process error: ${error.message}`));
    });
  });
}

/**
 * Main function to start Electron development mode
 * @returns {Promise<void>}
 */
async function startElectronDev() {
  try {
    // 1. Build Electron dependencies first
    console.log('📦 Building Electron dependencies...');
    await buildElectronDeps();

    // 2. Start Remix development server
    console.log('🌐 Starting Remix development server...');
    remixProcess = spawnPnpm(['dev'], {
      stdio: 'pipe',
      env: { ...process.env },
    });

    remixProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[Remix] ${output.trim()}`);
    });

    remixProcess.stderr.on('data', (data) => {
      console.error(`[Remix Error] ${data.toString().trim()}`);
    });

    // Wait for Remix server to start
    await waitForServer(REMIX_PORT, 'Remix development server');

    // 3. Start Electron application
    console.log('⚡ Starting Electron application...');

    const mainPath = path.join(__dirname, '..', 'build', 'electron', 'main', 'index.mjs');

    // Check if main process file exists
    if (!fs.existsSync(mainPath)) {
      throw new Error(`Main process file not found: ${mainPath}`);
    }

    electronProcess = spawn(electronPath, [mainPath], {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'development',
        ELECTRON_IS_DEV: '1',
      },
    });

    electronProcess.on('error', (error) => {
      console.error('❌ Failed to start Electron:', error);
      cleanup();
    });

    electronProcess.on('exit', (code) => {
      console.log(`📱 Electron process exited with code: ${code}`);

      if (code !== 0) {
        cleanup();
      }
    });

    console.log('🎉 Electron hot-reload development mode started!');
    console.log('💡 Code changes will automatically reload');
    console.log('🛑 Press Ctrl+C to exit');
  } catch (error) {
    console.error('❌ Startup failed:', error.message);
    cleanup();
  }
}

// Start development mode
startElectronDev();
