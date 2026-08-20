import type { Header, NetworkRecord, ReplayRequest, ReplayResponse } from '../types';
import { prettyBody } from './format';

export type DiffScope = 'summary' | 'requestHeaders' | 'requestBody' | 'responseHeaders' | 'responseBody';
export type DiffRow = { scope: DiffScope; field: string; original?: string; compared?: string; kind: 'changed' | 'added' | 'removed' };

type ComparableRequest = Pick<NetworkRecord, 'status' | 'duration' | 'requestHeaders' | 'responseHeaders' | 'requestBody' | 'responseBody'>;

const mapHeaders = (headers: Header[]): Record<string, string> => Object.fromEntries(headers.map(({ name, value }) => [name.toLowerCase(), value]));

function flattenBody(body?: string): Record<string, string> {
  if (!body) return {};
  try {
    const result: Record<string, string> = {};
    const walk = (value: unknown, path: string): void => {
      if (Array.isArray(value)) value.forEach((child, index) => walk(child, `${path}[${index}]`));
      else if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => walk(child, path ? `${path}.${key}` : key));
      else result[path || '$'] = String(value);
    };
    walk(JSON.parse(body) as unknown, '');
    return result;
  } catch { return { '$': prettyBody(body) }; }
}

function compareMap(scope: DiffScope, original: Record<string, string>, compared: Record<string, string>): DiffRow[] {
  const keys = new Set([...Object.keys(original), ...Object.keys(compared)]);
  return [...keys].sort().flatMap((field): DiffRow[] => {
    const left = original[field];
    const right = compared[field];
    if (left === right) return [];
    return [{ scope, field, original: left, compared: right, kind: left === undefined ? 'added' : right === undefined ? 'removed' : 'changed' }];
  });
}

export function replayAsComparable(request: ReplayRequest, replay: ReplayResponse): ComparableRequest {
  return { status: replay.status, duration: replay.duration, requestHeaders: request.headers, responseHeaders: replay.headers, requestBody: request.body, responseBody: replay.body };
}

export function compareNetworkRequests(original: ComparableRequest, compared: ComparableRequest): DiffRow[] {
  const summary: DiffRow[] = [];
  if (original.status !== compared.status) summary.push({ scope: 'summary', field: 'status', original: String(original.status), compared: String(compared.status), kind: 'changed' });
  if (Math.round(original.duration) !== Math.round(compared.duration)) summary.push({ scope: 'summary', field: 'duration', original: `${Math.round(original.duration)} ms`, compared: `${Math.round(compared.duration)} ms`, kind: 'changed' });
  return [
    ...summary,
    ...compareMap('requestHeaders', mapHeaders(original.requestHeaders), mapHeaders(compared.requestHeaders)),
    ...compareMap('requestBody', flattenBody(original.requestBody), flattenBody(compared.requestBody)),
    ...compareMap('responseHeaders', mapHeaders(original.responseHeaders), mapHeaders(compared.responseHeaders)),
    ...compareMap('responseBody', flattenBody(original.responseBody), flattenBody(compared.responseBody))
  ];
}
