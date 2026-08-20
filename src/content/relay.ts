import type { ExtensionMessage, PageEvent, ReplayResponse, WebStorageData } from '../types';

const INVALIDATED_EVENT = 'devscope:extension-context-invalidated';
const extensionContextAvailable = (): boolean => {
  try { return Boolean(chrome.runtime?.id); } catch { return false; }
};
const invalidatedContext = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return !extensionContextAvailable() || /extension context invalidated/i.test(message);
};
const announceInvalidatedContext = (): void => {
  try { window.dispatchEvent(new Event(INVALIDATED_EVENT)); } catch { /* The page may already be gone. */ }
};

// This file is loaded as a classic manifest content script. Keeping the safe
// runtime sender local prevents Vite from introducing a static shared import.
const sendRuntimeMessageQuietly = (message: ExtensionMessage, onInvalidated: () => void): void => {
  let invalidationHandled = false;
  const invalidated = (): void => {
    if (invalidationHandled) return;
    invalidationHandled = true;
    announceInvalidatedContext();
    try { onInvalidated(); } catch { /* Cleanup stays best-effort. */ }
  };
  try {
    if (!extensionContextAvailable()) { invalidated(); return; }
    const pending = chrome.runtime.sendMessage(message, () => {
      let lastError: { message?: string } | undefined;
      try { lastError = chrome.runtime.lastError; } catch { invalidated(); return; }
      if (lastError && invalidatedContext(lastError.message ?? lastError)) invalidated();
    }) as unknown as Promise<unknown> | undefined;
    // Chromium can expose a Promise even when a callback is supplied. During
    // an extension reload that Promise may reject without invoking the callback.
    // Observing it here prevents an "Uncaught Error" in the inspected page.
    void pending?.catch((error: unknown) => {
      if (invalidatedContext(error)) invalidated();
    });
  } catch (error) {
    if (invalidatedContext(error)) invalidated();
  }
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
  sendRuntimeMessageQuietly(message, stopForwarding);
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
