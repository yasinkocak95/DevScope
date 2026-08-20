import type { Header, PageEvent, PageInfo, ReplayRequest, ReplayResponse, RequestInitiator, RequestInitiatorFrame } from '../types';

const SOURCE = 'devscope-page-hook';
const MAX_BODY_CHARS = 100_000;
const INSTALL_FLAG = '__devscopePageHookInstalled__';
type DevScopeWindow = Window & { [INSTALL_FLAG]?: boolean; navigation?: EventTarget };

const devScopeWindow = window as DevScopeWindow;
if (!devScopeWindow[INSTALL_FLAG]) {
  devScopeWindow[INSTALL_FLAG] = true;
  installPageHook();
}

function installPageHook(): void {

const send = (payload: PageEvent): void => {
  window.postMessage({ source: SOURCE, payload }, window.location.origin);
};

const clip = (value?: string | null): { value?: string; truncated: boolean } => {
  if (!value) return { value: undefined, truncated: false };
  if (value.length <= MAX_BODY_CHARS) return { value, truncated: false };
  return { value: `${value.slice(0, MAX_BODY_CHARS)}\n... [truncated by DevScope]`, truncated: true };
};

async function readLimitedText(response: Response): Promise<{ value?: string; truncated: boolean }> {
  const reader = response.clone().body?.getReader();
  if (!reader) return { value: undefined, truncated: false };
  const decoder = new TextDecoder();
  let value = '';
  try {
    while (value.length <= MAX_BODY_CHARS) {
      const chunk = await reader.read();
      if (chunk.done) return clip(value + decoder.decode());
      value += decoder.decode(chunk.value, { stream: true });
    }
    await reader.cancel();
    return clip(value);
  } catch {
    return { value: undefined, truncated: false };
  }
}

const safeString = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
};

const captureRequestInitiator = (type: RequestInitiator['type']): RequestInitiator | undefined => {
  const stackLines = new Error().stack?.split('\n').slice(1) ?? [];
  const frames: RequestInitiatorFrame[] = [];

  for (const rawLine of stackLines) {
    const line = rawLine.trim();
    const match = line.match(/^at\s+(?:(.*?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
    if (!match) continue;
    const [, rawFunctionName, source, rawLineNumber, rawColumn] = match;
    if (/\/assets\/pageHook\.js(?:\?|$)/i.test(source) || /^chrome-extension:/i.test(source)) continue;
    const functionName = rawFunctionName && rawFunctionName !== '<anonymous>' ? rawFunctionName : undefined;
    frames.push({
      functionName,
      source,
      line: Number(rawLineNumber),
      column: Number(rawColumn)
    });
    if (frames.length >= 8) break;
  }

  return frames.length ? { type, frames } : undefined;
};

const headersFrom = (headers?: HeadersInit): Header[] => {
  if (!headers) return [];
  try { return [...new Headers(headers).entries()].map(([name, value]) => ({ name, value })); } catch { return []; }
};

const pageInfo = (): PageInfo => ({
  url: location.href,
  title: document.title,
  userAgent: navigator.userAgent,
  viewportWidth: window.innerWidth,
  viewportHeight: window.innerHeight,
  devicePixelRatio: window.devicePixelRatio,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  timestamp: Date.now(),
  platform: (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform
});

const sendPageInfo = (): void => send({ kind: 'page-info', pageInfo: pageInfo() });
window.addEventListener('DOMContentLoaded', sendPageInfo, { once: true });
window.addEventListener('resize', sendPageInfo);
window.addEventListener('pageshow', sendPageInfo);

let lastPageUrl = location.href;
const sendPageInfoOnNavigation = (): void => {
  if (location.href === lastPageUrl) return;
  lastPageUrl = location.href;
  sendPageInfo();
};
const checkNavigationAfterCurrentTask = (): void => {
  queueMicrotask(sendPageInfoOnNavigation);
  window.setTimeout(sendPageInfoOnNavigation, 0);
};
const nativePushState = history.pushState;
const nativeReplaceState = history.replaceState;
history.pushState = function devScopePushState(data: unknown, unused: string, url?: string | URL | null): void {
  nativePushState.call(this, data, unused, url);
  checkNavigationAfterCurrentTask();
};
history.replaceState = function devScopeReplaceState(data: unknown, unused: string, url?: string | URL | null): void {
  nativeReplaceState.call(this, data, unused, url);
  checkNavigationAfterCurrentTask();
};
window.addEventListener('popstate', sendPageInfoOnNavigation);
window.addEventListener('hashchange', sendPageInfoOnNavigation);
devScopeWindow.navigation?.addEventListener('navigate', checkNavigationAfterCurrentTask);
devScopeWindow.navigation?.addEventListener('currententrychange', checkNavigationAfterCurrentTask);

// Some routers replace the History API methods after document_start or update the
// address bar through another navigation primitive. This lightweight fallback
// keeps route detection alive without installing more listeners or wrappers.
window.setInterval(sendPageInfoOnNavigation, 500);

const meaningfulControl = (event: Event): Element | undefined => {
  const path = event.composedPath();
  if (path.some((item) => item instanceof Element && item.id.startsWith('devscope-floating-'))) return undefined;
  return path.find((item): item is Element => item instanceof Element && item.matches('button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]'));
};

const controlLabel = (element?: Element | null): string | undefined => {
  if (!element) return undefined;
  if (element instanceof HTMLInputElement && element.type.toLowerCase() === 'password') return undefined;
  const raw = element.getAttribute('aria-label')
    ?? element.getAttribute('title')
    ?? (element instanceof HTMLInputElement && ['button', 'submit'].includes(element.type.toLowerCase()) ? element.value : undefined)
    ?? element.textContent;
  const value = raw?.replace(/\s+/g, ' ').trim().slice(0, 160);
  return value || undefined;
};

document.addEventListener('click', (event) => {
  const control = meaningfulControl(event);
  if (!control) return;
  send({ kind: 'debug-action', action: 'click', timestamp: Date.now(), label: controlLabel(control) });
}, true);

document.addEventListener('submit', (event) => {
  const path = event.composedPath();
  if (path.some((item) => item instanceof Element && item.id.startsWith('devscope-floating-'))) return;
  const submitter = event instanceof SubmitEvent ? event.submitter : undefined;
  const form = path.find((item): item is HTMLFormElement => item instanceof HTMLFormElement);
  const label = controlLabel(submitter)
    ?? form?.getAttribute('aria-label')?.replace(/\s+/g, ' ').trim().slice(0, 160)
    ?? form?.getAttribute('name')?.slice(0, 160)
    ?? form?.id.slice(0, 160)
    ?? undefined;
  send({ kind: 'debug-action', action: 'submit', timestamp: Date.now(), label });
}, true);

const nativeFetch = window.fetch;
window.fetch = async function devScopeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const startedAt = Date.now();
  const traceId = crypto.randomUUID();
  const initiator = captureRequestInitiator('fetch');
  const request = input instanceof Request ? input : undefined;
  const url = new URL(request?.url ?? String(input), location.href).href;
  const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
  const requestBody = clip(typeof init?.body === 'string' ? init.body : undefined);
  const requestHeaders = headersFrom(init?.headers ?? request?.headers);

  try {
    const response = await nativeFetch.apply(this, [input, init]);
    let responseText: string | undefined;
    let truncated = requestBody.truncated;
    const contentType = response.headers.get('content-type') ?? undefined;
    if (contentType && /(json|text|xml|javascript|graphql|form)/i.test(contentType)) {
      try {
        const body = await readLimitedText(response);
        responseText = body.value;
        truncated ||= body.truncated;
      } catch { /* Opaque and streaming responses may not be readable. */ }
    }
    send({
      kind: 'network', traceId, method, url, status: response.status, statusText: response.statusText,
      startedAt, duration: Date.now() - startedAt,
      resourceType: 'fetch', requestHeaders, responseHeaders: [...response.headers.entries()].map(([name, value]) => ({ name, value })),
      requestBody: requestBody.value, responseBody: responseText, contentType, truncated, initiator
    });
    return response;
  } catch (error) {
    send({
      kind: 'network', traceId, method, url, status: 0, startedAt, duration: Date.now() - startedAt,
      resourceType: 'fetch', requestHeaders, responseHeaders: [], requestBody: requestBody.value,
      error: error instanceof Error ? error.message : String(error), truncated: requestBody.truncated, initiator
    });
    throw error;
  }
};

const NativeXHR = window.XMLHttpRequest;
type TrackedXhr = XMLHttpRequest & { __ds?: { method: string; url: string; startedAt: number; body?: string; requestHeaders: Header[]; initiator?: RequestInitiator } };
const nativeOpen = NativeXHR.prototype.open;
const nativeSend = NativeXHR.prototype.send;
const nativeSetHeader = NativeXHR.prototype.setRequestHeader;

NativeXHR.prototype.open = function (this: TrackedXhr, method: string, url: string | URL, async: boolean = true, username?: string | null, password?: string | null): void {
  this.__ds = { method: method.toUpperCase(), url: String(url), startedAt: 0, requestHeaders: [] };
  nativeOpen.call(this, method, url, async, username, password);
};

NativeXHR.prototype.setRequestHeader = function (this: TrackedXhr, name: string, value: string): void {
  this.__ds?.requestHeaders.push({ name, value });
  nativeSetHeader.call(this, name, value);
};

NativeXHR.prototype.send = function (this: TrackedXhr, body?: Document | XMLHttpRequestBodyInit | null): void {
  const meta = this.__ds ?? { method: 'GET', url: '', startedAt: 0, requestHeaders: [] };
  meta.startedAt = Date.now();
  meta.body = typeof body === 'string' ? body : undefined;
  meta.initiator = captureRequestInitiator('xhr');
  const done = (): void => {
    const contentType = this.getResponseHeader('content-type') ?? undefined;
    let responseBody: string | undefined;
    if (!this.responseType || this.responseType === 'text' || this.responseType === 'json') {
      try { responseBody = this.responseType === 'json' ? JSON.stringify(this.response) : this.responseText; } catch { /* unavailable */ }
    }
    const req = clip(meta.body);
    const res = clip(responseBody);
    const rawHeaders = this.getAllResponseHeaders().trim().split(/[\r\n]+/).filter(Boolean);
    send({
      kind: 'network', traceId: crypto.randomUUID(), method: meta.method, url: new URL(meta.url, location.href).href,
      status: this.status, statusText: this.statusText, startedAt: meta.startedAt, duration: Date.now() - meta.startedAt,
      resourceType: 'xhr', requestHeaders: meta.requestHeaders,
      responseHeaders: rawHeaders.map((line) => { const index = line.indexOf(':'); return { name: line.slice(0, index).trim(), value: line.slice(index + 1).trim() }; }),
      requestBody: req.value, responseBody: res.value, contentType, truncated: req.truncated || res.truncated,
      error: this.status === 0 ? 'Network request failed or was blocked' : undefined,
      initiator: meta.initiator
    });
  };
  this.addEventListener('loadend', done, { once: true });
  nativeSend.call(this, body);
};

const serializeConsole = (args: unknown[]): string => args.map(safeString).join(' ').slice(0, 10_000);

const NON_ACTIONABLE_CONSOLE_PATTERNS = [
  /\[GPT\].*\bdeprecated\b/i,
  /googletag\.(?:encryptedSignalProviders|secureSignalProviders)/i,
  /Google Deploy of the SharedId library has been deprecated/i,
  /@formatjs\/intl Error MISSING_TRANSLATION.*artifacts\.folder_surface\.root_breadcrumb\.tooltip\.view_in_library/i
];

const isNonActionableConsoleNoise = (message: string): boolean =>
  NON_ACTIONABLE_CONSOLE_PATTERNS.some((pattern) => pattern.test(message));

const consoleCaller = (): { source?: string; line?: number } => {
  const lines = new Error().stack?.split('\n').slice(2) ?? [];
  for (const stackLine of lines) {
    const match = stackLine.match(/((?:https?|file|chrome-extension):\/\/[^\s)]+?):(\d+):(\d+)/i);
    if (!match || /\/assets\/pageHook\.js(?::|$)/i.test(match[1])) continue;
    return { source: match[1], line: Number(match[2]) };
  }
  return {};
};

(['error', 'warn'] as const).forEach((level) => {
  const native = console[level];
  console[level] = (...args: unknown[]): void => {
    const message = serializeConsole(args);
    if (!isNonActionableConsoleNoise(message)) {
      send({ kind: 'console', level, message, timestamp: Date.now(), ...consoleCaller() });
    }
    native.apply(console, args);
  };
});

window.addEventListener('error', (event) => {
  if (!isNonActionableConsoleNoise(event.message)) {
    send({ kind: 'console', level: 'error', message: event.message, timestamp: Date.now(), source: event.filename, line: event.lineno });
  }
});
window.addEventListener('unhandledrejection', (event) => {
  const message = `Unhandled promise rejection: ${safeString(event.reason)}`;
  if (!isNonActionableConsoleNoise(message)) {
    send({ kind: 'console', level: 'error', message, timestamp: Date.now() });
  }
});

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.source !== window || !event.data || typeof event.data !== 'object') return;
  const data = event.data as { source?: string; requestId?: string; request?: ReplayRequest };
  if (data.source !== 'devscope-replay-request' || !data.requestId || !data.request) return;
  const { requestId, request } = data;
  const startedAt = Date.now();
  const complete = (response: ReplayResponse): void => {
    window.postMessage({ source: 'devscope-replay-response', requestId, response }, window.location.origin);
  };
  const init: RequestInit = {
    method: request.method,
    headers: Object.fromEntries(request.headers.map(({ name, value }) => [name, value])),
    credentials: 'include'
  };
  if (!['GET', 'HEAD'].includes(request.method.toUpperCase()) && request.body) init.body = request.body;
  void nativeFetch(request.url, init).then(async (response) => {
    const contentType = response.headers.get('content-type') ?? undefined;
    const body = contentType && /(json|text|xml|javascript|graphql|form)/i.test(contentType)
      ? await readLimitedText(response)
      : { value: undefined, truncated: false };
    complete({
      url: response.url,
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()].map(([name, value]) => ({ name, value })),
      body: body.value,
      duration: Date.now() - startedAt,
      contentType,
      truncated: body.truncated
    });
  }).catch((error: unknown) => complete({
    url: request.url,
    status: 0,
    statusText: '',
    headers: [],
    duration: Date.now() - startedAt,
    error: error instanceof Error ? error.message : String(error)
  }));
});
}
