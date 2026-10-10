import { WebContainer } from '@webcontainer/api';
import { WORK_DIR_NAME } from '~/utils/constants';
import { cleanStackTrace } from '~/utils/stacktrace';

interface WebContainerContext {
  loaded: boolean;
}

export const webcontainerContext: WebContainerContext = import.meta.hot?.data.webcontainerContext ?? {
  loaded: false,
};

if (import.meta.hot) {
  import.meta.hot.data.webcontainerContext = webcontainerContext;
}

export let webcontainer: Promise<WebContainer> = new Promise(() => {
  // noop for ssr
});

let bootFailed = false;
let bootedInstance: WebContainer | undefined = import.meta.hot?.data.webcontainerInstance;

function createWebContainerPromise(): Promise<WebContainer> {
  return Promise.resolve(bootedInstance)
    .then(
      (instance) =>
        instance ??
        WebContainer.boot({
          coep: 'credentialless',
          workdirName: WORK_DIR_NAME,
          forwardPreviewErrors: true,
        }),
    )
    .then(async (instance) => {
      bootedInstance = instance;

      if (import.meta.hot) {
        import.meta.hot.data.webcontainerInstance = instance;
      }

      const { workbenchStore } = await import('~/lib/stores/workbench');
      const response = await fetch('/inspector-script.js');
      const inspectorScript = await response.text();
      await instance.setPreviewScript(inspectorScript);

      instance.on('preview-message', (message) => {
        console.log('WebContainer preview message:', message);

        if (message.type === 'PREVIEW_UNCAUGHT_EXCEPTION' || message.type === 'PREVIEW_UNHANDLED_REJECTION') {
          const isPromise = message.type === 'PREVIEW_UNHANDLED_REJECTION';
          const title = isPromise ? 'Unhandled Promise Rejection' : 'Uncaught Exception';
          workbenchStore.actionAlert.set({
            type: 'preview',
            title,
            description: 'message' in message ? message.message : 'Unknown error',
            content: `Error occurred at ${message.pathname}${message.search}${message.hash}\nPort: ${message.port}\n\nStack trace:\n${cleanStackTrace(message.stack || '')}`,
            source: 'preview',
          });
        }
      });

      webcontainerContext.loaded = true;
      bootFailed = false;

      return instance;
    })
    .catch((error) => {
      bootFailed = true;

      if (import.meta.hot?.data.webcontainer === webcontainer) {
        delete import.meta.hot.data.webcontainer;
      }

      throw error;
    });
}

export function retryWebContainerBoot(): Promise<WebContainer> {
  if (!bootFailed || webcontainerContext.loaded) {
    return webcontainer;
  }

  bootFailed = false;
  webcontainer = createWebContainerPromise();

  if (import.meta.hot) {
    import.meta.hot.data.webcontainer = webcontainer;
  }

  return webcontainer;
}

if (!import.meta.env.SSR) {
  webcontainer = import.meta.hot?.data.webcontainer ?? createWebContainerPromise();

  void webcontainer.catch(() => {
    bootFailed = true;

    if (import.meta.hot?.data.webcontainer === webcontainer) {
      delete import.meta.hot.data.webcontainer;
    }
  });

  if (import.meta.hot) {
    import.meta.hot.data.webcontainer = webcontainer;
  }
}
