import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',
      '.idea',
      '.git',
      '.cache'
    ],
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, './app')
    }
  }
}); 