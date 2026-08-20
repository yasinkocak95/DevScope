import type { NetworkRecord } from '../types';
import { sanitizeRequest } from './redaction';

type HarHeader = { name: string; value: string };
type HarEntry = {
  startedDateTime: string;
  time: number;
  request: { method: string; url: string; httpVersion?: string; headers: HarHeader[]; queryString?: HarHeader[]; postData?: { mimeType?: string; text?: string }; headersSize?: number; bodySize?: number };
  response: { status: number; statusText?: string; httpVersion?: string; headers: HarHeader[]; content: { size?: number; mimeType?: string; text?: string; encoding?: string }; redirectURL?: string; headersSize?: number; bodySize?: number };
  timings?: { send?: number; wait?: number; receive?: number };
  _resourceType?: string;
};

type HarFile = { log: { version: string; creator: { name: string; version: string }; entries: HarEntry[] } };

export function exportHar(requests: NetworkRecord[], revealSensitive: boolean): string {
  const entries = [...requests].sort((a, b) => a.startedAt - b.startedAt).map((item): HarEntry => {
    const request = sanitizeRequest(item, revealSensitive);
    let queryString: HarHeader[] = [];
    try { queryString = [...new URL(request.url).searchParams.entries()].map(([name, value]) => ({ name, value })); } catch { /* invalid captured URL */ }
    return {
      startedDateTime: new Date(request.startedAt).toISOString(),
      time: request.duration,
      request: {
        method: request.method,
        url: request.url,
        httpVersion: 'HTTP/1.1',
        headers: request.requestHeaders,
        queryString,
        postData: request.requestBody ? { mimeType: request.contentType, text: request.requestBody } : undefined,
        headersSize: -1,
        bodySize: request.requestSize ?? -1
      },
      response: {
        status: request.status,
        statusText: request.statusText ?? '',
        httpVersion: 'HTTP/1.1',
        headers: request.responseHeaders,
        content: { size: request.responseSize ?? 0, mimeType: request.contentType, text: request.responseBody },
        redirectURL: '',
        headersSize: -1,
        bodySize: request.responseSize ?? -1
      },
      timings: { send: 0, wait: request.duration, receive: 0 },
      _resourceType: request.resourceType
    };
  });
  const har: HarFile = { log: { version: '1.2', creator: { name: 'DevScope', version: '2.0.0' }, entries } };
  return JSON.stringify(har, null, 2);
}

function decodeContent(content: HarEntry['response']['content']): { body?: string; truncated: boolean } {
  if (!content.text) return { body: undefined, truncated: false };
  const truncated = content.text.length > 140_000;
  const text = content.text.slice(0, 140_000);
  if (content.encoding !== 'base64') return { body: text.slice(0, 100_000), truncated: content.text.length > 100_000 };
  try {
    const binary = atob(text.slice(0, text.length - (text.length % 4)));
    return { body: new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0))).slice(0, 100_000), truncated };
  } catch { return { body: undefined, truncated }; }
}

export function importHar(text: string): NetworkRecord[] {
  const parsed = JSON.parse(text) as Partial<HarFile>;
  if (!parsed.log || parsed.log.version !== '1.2' || !Array.isArray(parsed.log.entries)) throw new Error('INVALID_HAR');
  return parsed.log.entries.slice(0, 500).map((entry, index) => {
    if (!entry.request?.url || !entry.request.method || !entry.response) throw new Error('INVALID_HAR');
    try { new URL(entry.request.url); } catch { throw new Error('INVALID_HAR'); }
    const responseContent = decodeContent(entry.response.content ?? {});
    const requestBody = entry.request.postData?.text?.slice(0, 100_000);
    return {
      id: `har-${Date.now()}-${index}-${crypto.randomUUID()}`,
      tabId: -1,
      method: entry.request.method.toUpperCase(),
      url: entry.request.url,
      status: Number(entry.response.status) || 0,
      statusText: entry.response.statusText,
      startedAt: Date.parse(entry.startedDateTime) || Date.now(),
      duration: Number(entry.time) || 0,
      resourceType: entry._resourceType === 'fetch' ? 'fetch' : 'xhr',
      requestHeaders: Array.isArray(entry.request.headers) ? entry.request.headers : [],
      responseHeaders: Array.isArray(entry.response.headers) ? entry.response.headers : [],
      requestBody,
      responseBody: responseContent.body,
      requestSize: entry.request.bodySize && entry.request.bodySize >= 0 ? entry.request.bodySize : undefined,
      responseSize: entry.response.bodySize && entry.response.bodySize >= 0 ? entry.response.bodySize : entry.response.content?.size,
      contentType: entry.response.content?.mimeType,
      error: entry.response.status === 0 ? entry.response.statusText : undefined,
      truncated: responseContent.truncated || Boolean(entry.request.postData?.text && entry.request.postData.text.length > 100_000)
    };
  });
}
