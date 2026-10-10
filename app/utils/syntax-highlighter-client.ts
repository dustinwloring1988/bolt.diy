/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Syntax Highlighter Client
 * Interface for using the web worker-based syntax highlighter
 */

import type { BundledLanguage, BundledTheme } from 'shiki';

interface PendingRequest {
  resolve: (html: string) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

interface CachedHighlight {
  html: string;
  bytes: number;
}

export class SyntaxHighlighterClient {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private requestCounter = 0;
  private cache = new Map<string, CachedHighlight>();
  private readonly MAX_CACHE_SIZE = 500;
  private readonly MAX_CACHE_BYTES = 8 * 1024 * 1024;
  private cacheBytes = 0;

  constructor() {
    this.initWorker();
  }

  private initWorker(): void {
    try {
      this.worker = new Worker(new URL('../workers/syntax-highlighter.worker.ts', import.meta.url), { type: 'module' });

      this.worker.addEventListener('message', (event) => {
        const { id, html, error } = event.data;
        const pending = this.pendingRequests.get(id);

        if (pending) {
          this.pendingRequests.delete(id);
          clearTimeout(pending.timeoutId);

          if (error) {
            pending.reject(new Error(error));
          } else {
            pending.resolve(html);
          }
        }
      });

      this.worker.addEventListener('error', (error) => {
        console.error('Worker error:', error);

        this.rejectPendingRequests(new Error('Worker error'));
        this.worker?.terminate();
        this.worker = null;
      });
    } catch (error) {
      console.error('Failed to initialize syntax highlighter worker:', error);
    }
  }

  /**
   * Highlight code with caching
   */
  async highlight(code: string, language: BundledLanguage, theme: BundledTheme = 'dark-plus'): Promise<string> {
    // Check cache first
    const cacheKey = `${language}:${theme}:${code}`;
    const cached = this.cache.get(cacheKey);

    if (cached) {
      // Refresh insertion order to maintain an LRU cache.
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cached);

      return cached.html;
    }

    // If worker is not available, return plain text
    if (!this.worker) {
      return this.fallbackHighlight(code);
    }

    // Create a promise for this request
    const id = `highlight-${++this.requestCounter}`;

    const promise = new Promise<string>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Highlight request timeout'));
        }
      }, 5000);

      this.pendingRequests.set(id, { resolve, reject, timeoutId });
    });

    try {
      this.worker.postMessage({ id, code, language, theme });

      const html = await promise;

      this.addToCache(cacheKey, html);

      return html;
    } catch (error) {
      const pending = this.pendingRequests.get(id);

      if (pending) {
        clearTimeout(pending.timeoutId);
        this.pendingRequests.delete(id);
      }

      console.error('Highlight error:', error);

      return this.fallbackHighlight(code);
    }
  }

  /**
   * Fallback to plain text rendering
   */
  private fallbackHighlight(code: string): string {
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    return `<pre><code>${escaped}</code></pre>`;
  }

  /**
   * Preload commonly used languages
   */
  async preload(): Promise<void> {
    // Worker initializes automatically with common languages
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheBytes = 0;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number; bytes: number; maxBytes: number } {
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      bytes: this.cacheBytes,
      maxBytes: this.MAX_CACHE_BYTES,
    };
  }

  /**
   * Terminate the worker
   */
  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.rejectPendingRequests(new Error('Syntax highlighter disposed'));
    this.cache.clear();
    this.cacheBytes = 0;
  }

  private addToCache(key: string, html: string): void {
    // JavaScript strings use UTF-16 code units; count key and HTML storage.
    const bytes = (key.length + html.length) * 2;

    if (bytes > this.MAX_CACHE_BYTES) {
      return;
    }

    const existing = this.cache.get(key);

    if (existing) {
      this.cacheBytes -= existing.bytes;
      this.cache.delete(key);
    }

    this.cache.set(key, { html, bytes });
    this.cacheBytes += bytes;

    while (this.cache.size > this.MAX_CACHE_SIZE || this.cacheBytes > this.MAX_CACHE_BYTES) {
      const oldestKey = this.cache.keys().next().value;

      if (oldestKey === undefined) {
        break;
      }

      const oldest = this.cache.get(oldestKey);

      if (oldest) {
        this.cacheBytes -= oldest.bytes;
      }

      this.cache.delete(oldestKey);
    }
  }

  private rejectPendingRequests(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}

// Singleton instance
let instance: SyntaxHighlighterClient | null = null;

/**
 * Get the singleton syntax highlighter instance
 */
export function getSyntaxHighlighter(): SyntaxHighlighterClient {
  if (!instance) {
    instance = new SyntaxHighlighterClient();
  }

  return instance;
}

/**
 * Convenience function for highlighting code
 */
export async function highlightCode(
  code: string,
  language: BundledLanguage,
  theme: BundledTheme = 'dark-plus',
): Promise<string> {
  const highlighter = getSyntaxHighlighter();
  return highlighter.highlight(code, language, theme);
}
