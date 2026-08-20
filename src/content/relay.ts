import type { ExtensionMessage, PageEvent, ReplayResponse, WebStorageData } from '../types';

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.source !== window || !event.data || typeof event.data !== 'object') return;
  const data = event.data as { source?: string; payload?: PageEvent };
  if (data.source !== 'devscope-page-hook' || !data.payload) return;
  const message: ExtensionMessage = { type: 'PAGE_EVENT', payload: data.payload };
  chrome.runtime.sendMessage(message).catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'GET_WEB_STORAGE') {
    try {
      const result: WebStorageData = {
        local: Object.entries(window.localStorage).map(([name, value]) => ({ name, value })),
        session: Object.entries(window.sessionStorage).map(([name, value]) => ({ name, value }))
      };
      sendResponse(result);
    } catch (error) {
      sendResponse({ local: [], session: [], error: error instanceof Error ? error.message : String(error) } satisfies WebStorageData);
    }
    return false;
  }
  if (message.type === 'REPLAY_REQUEST') {
    const requestId = crypto.randomUUID();
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', listener);
      sendResponse({ error: 'REPLAY_TIMEOUT', url: message.request.url, status: 0, statusText: '', headers: [], duration: 30_000 } satisfies ReplayResponse);
    }, 30_000);
    const listener = (event: MessageEvent<unknown>): void => {
      if (event.source !== window || !event.data || typeof event.data !== 'object') return;
      const data = event.data as { source?: string; requestId?: string; response?: ReplayResponse };
      if (data.source !== 'devscope-replay-response' || data.requestId !== requestId || !data.response) return;
      window.clearTimeout(timeout);
      window.removeEventListener('message', listener);
      sendResponse(data.response);
    };
    window.addEventListener('message', listener);
    window.postMessage({ source: 'devscope-replay-request', requestId, request: message.request }, window.location.origin);
    return true;
  }
  return false;
});
