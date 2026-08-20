import type { Header, NetworkRecord } from '../types';

const SENSITIVE_KEY = /(^|[-_])(authorization|access[-_]?token|refresh[-_]?token|password|passwd|secret|api[-_]?key|cookie|set[-_]?cookie)($|[-_])/i;
const JWT = /\beyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const MASK = '[REDACTED]';

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

export function redactText(value: string): string {
  let result = value.replace(BEARER, `Bearer ${MASK}`).replace(JWT, MASK);
  try {
    const parsed: unknown = JSON.parse(value);
    return JSON.stringify(redactJson(parsed), null, 2);
  } catch {
    return result.replace(/((?:password|passwd|secret|access_token|refresh_token|api_key|api-key)\s*[=:]\s*)[^&\s,;}]+/gi, `$1${MASK}`);
  }
}

export function redactJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, isSensitiveKey(key) ? MASK : redactJson(child)])
    );
  }
  return typeof value === 'string' ? value.replace(BEARER, `Bearer ${MASK}`).replace(JWT, MASK) : value;
}

export function redactHeaders(headers: Header[]): Header[] {
  return headers.map((header) => ({
    ...header,
    value: isSensitiveKey(header.name) ? MASK : redactText(header.value)
  }));
}

export function redactUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    for (const key of [...url.searchParams.keys()]) {
      if (isSensitiveKey(key)) url.searchParams.set(key, MASK);
    }
    return url.toString();
  } catch {
    return redactText(rawUrl);
  }
}

export function sanitizeRequest(request: NetworkRecord, reveal: boolean): NetworkRecord {
  if (reveal) return request;
  return {
    ...request,
    url: redactUrl(request.url),
    requestHeaders: redactHeaders(request.requestHeaders),
    responseHeaders: redactHeaders(request.responseHeaders),
    requestBody: request.requestBody ? redactText(request.requestBody) : undefined,
    responseBody: request.responseBody ? redactText(request.responseBody) : undefined
  };
}
