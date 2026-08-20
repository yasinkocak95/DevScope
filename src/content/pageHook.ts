import type { Header, PageEvent, PageInfo, ReplayRequest, ReplayResponse } from '../types';

const SOURCE = 'devscope-page-hook';
const MAX_BODY_CHARS = 100_000;

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

const nativeFetch = window.fetch;
window.fetch = async function devScopeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const startedAt = Date.now();
  const traceId = crypto.randomUUID();
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
      requestBody: requestBody.value, responseBody: responseText, contentType, truncated
    });
    return response;
  } catch (error) {
    send({
      kind: 'network', traceId, method, url, status: 0, startedAt, duration: Date.now() - startedAt,
      resourceType: 'fetch', requestHeaders, responseHeaders: [], requestBody: requestBody.value,
      error: error instanceof Error ? error.message : String(error), truncated: requestBody.truncated
    });
    throw error;
  }
};

const NativeXHR = window.XMLHttpRequest;
type TrackedXhr = XMLHttpRequest & { __ds?: { method: string; url: string; startedAt: number; body?: string; requestHeaders: Header[] } };
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
      error: this.status === 0 ? 'Network request failed or was blocked' : undefined
    });
  };
  this.addEventListener('loadend', done, { once: true });
  nativeSend.call(this, body);
};

const serializeConsole = (args: unknown[]): string => args.map(safeString).join(' ').slice(0, 10_000);
(['error', 'warn'] as const).forEach((level) => {
  const native = console[level];
  console[level] = (...args: unknown[]): void => {
    send({ kind: 'console', level, message: serializeConsole(args), timestamp: Date.now() });
    native.apply(console, args);
  };
});

window.addEventListener('error', (event) => {
  send({ kind: 'console', level: 'error', message: event.message, timestamp: Date.now(), source: event.filename, line: event.lineno });
});
window.addEventListener('unhandledrejection', (event) => {
  send({ kind: 'console', level: 'error', message: `Unhandled promise rejection: ${safeString(event.reason)}`, timestamp: Date.now() });
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
