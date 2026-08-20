import type { ExtensionMessage, PageEvent, ReplayResponse, WebStorageData } from '../types';

const extensionContextAvailable = (): boolean => {
  try { return Boolean(chrome.runtime?.id); } catch { return false; }
};

const isExtensionContextInvalidated = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return !extensionContextAvailable() || /extension context invalidated/i.test(message);
};

let forwarding = true;

function stopForwarding(): void {
  if (!forwarding) return;
  forwarding = false;
  window.removeEventListener('message', forwardPageEvent);
}

function forwardPageEvent(event: MessageEvent<unknown>): void {
  if (event.source !== window || !event.data || typeof event.data !== 'object') return;
  const data = event.data as { source?: string; payload?: PageEvent };
  if (data.source !== 'devscope-page-hook' || !data.payload) return;
  const message: ExtensionMessage = { type: 'PAGE_EVENT', payload: data.payload };
  try {
    if (!extensionContextAvailable()) {
      stopForwarding();
      return;
    }
    void chrome.runtime.sendMessage(message).catch((error: unknown) => {
      if (isExtensionContextInvalidated(error)) stopForwarding();
    });
  } catch (error) {
    if (isExtensionContextInvalidated(error)) stopForwarding();
  }
}

window.addEventListener('message', forwardPageEvent);

const onRuntimeMessage = (message: ExtensionMessage, _sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void): boolean => {
  const respond = (response: unknown): void => { try { sendResponse(response); } catch { /* The calling context was closed. */ } };
  if (message.type === 'GET_WEB_STORAGE') {
    try {
      const result: WebStorageData = {
        local: Object.entries(window.localStorage).map(([name, value]) => ({ name, value })),
        session: Object.entries(window.sessionStorage).map(([name, value]) => ({ name, value }))
      };
      respond(result);
    } catch (error) {
      respond({ local: [], session: [], error: error instanceof Error ? error.message : String(error) } satisfies WebStorageData);
    }
    return false;
  }
  if (message.type === 'REPLAY_REQUEST') {
    const requestId = crypto.randomUUID();
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', listener);
      respond({ error: 'REPLAY_TIMEOUT', url: message.request.url, status: 0, statusText: '', headers: [], duration: 30_000 } satisfies ReplayResponse);
    }, 30_000);
    const listener = (event: MessageEvent<unknown>): void => {
      if (event.source !== window || !event.data || typeof event.data !== 'object') return;
      const data = event.data as { source?: string; requestId?: string; response?: ReplayResponse };
      if (data.source !== 'devscope-replay-response' || data.requestId !== requestId || !data.response) return;
      window.clearTimeout(timeout);
      window.removeEventListener('message', listener);
      respond(data.response);
    };
    window.addEventListener('message', listener);
    window.postMessage({ source: 'devscope-replay-request', requestId, request: message.request }, window.location.origin);
    return true;
  }
  return false;
};

try {
  if (extensionContextAvailable()) chrome.runtime.onMessage.addListener(onRuntimeMessage);
} catch { /* A stale content script must remain inert after an extension reload. */ }
