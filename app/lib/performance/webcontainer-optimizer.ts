/**
 * WebContainer Initialization Optimizer
 * Bridges the optimizer API to the canonical webcontainer singleton in
 * app/lib/webcontainer/index.ts so that WebContainer.boot() is only ever
 * called once per browser tab.
 */

let webContainerBootPromise: Promise<any> | null = null;
let webContainerInstance: any = null;

/**
 * Start booting WebContainer in the background.
 * Delegates to the canonical singleton promise so we never call boot() twice.
 */
export function prebootWebContainer(): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (webContainerBootPromise) {
    return; // Already initialised
  }

  /*
   * Import the canonical singleton promise that was created in
   * app/lib/webcontainer/index.ts.  That module calls WebContainer.boot()
   * exactly once (guarded by import.meta.hot HMR caching), so piggybacking
   * on it avoids the "Only a single WebContainer instance can be booted"
   * error that fires when this optimizer tried to call boot() a second time.
   */
  webContainerBootPromise = import('~/lib/webcontainer')
    .then(({ retryWebContainerBoot }) => retryWebContainerBoot())
    .then((instance) => {
      console.log('[WEBCONTAINER] Booted successfully');
      webContainerInstance = instance;

      return instance;
    })
    .catch((error) => {
      console.error('[WEBCONTAINER] Boot failed:', error);
      webContainerBootPromise = null;
      throw error;
    });
}

/**
 * Get the WebContainer instance
 * If boot was started with prebootWebContainer(), this will be fast
 * Otherwise, it will start the boot now
 */
export async function getWebContainer(): Promise<any> {
  if (webContainerInstance) {
    return webContainerInstance;
  }

  if (!webContainerBootPromise) {
    prebootWebContainer();
  }

  return webContainerBootPromise!;
}

/**
 * Check if WebContainer is ready
 */
export function isWebContainerReady(): boolean {
  return webContainerInstance !== null;
}

/**
 * Reset WebContainer state (useful for testing)
 */
export function resetWebContainer(): void {
  webContainerBootPromise = null;
  webContainerInstance = null;
}

/**
 * Preconnect to WebContainer CDN
 * This should be added to the HTML head for DNS/TCP preflight
 */
export function getWebContainerPreconnect(): string {
  return 'https://unpkg.com'; // WebContainer uses unpkg for packages
}
