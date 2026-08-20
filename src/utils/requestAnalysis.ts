import type { NetworkRecord } from '../types';

export type DuplicateRequestInfo = {
  method: string;
  endpoint: string;
  count: number;
  windowMs: number;
};

export type NetworkFilterPreset = 'All' | 'Errors' | 'Slow' | 'Auth' | 'Duplicates' | 'Fetch/XHR' | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type NumericOperator = '=' | '>' | '>=' | '<' | '<=';
type SmartFilter = { field: 'status' | 'time'; operator: NumericOperator; value: number }
  | { field: 'method' | 'domain' | 'url' | 'type'; value: string };

export type SmartNetworkQuery = { filters: SmartFilter[]; terms: string[]; highlightTerms: string[] };

export const DUPLICATE_REQUEST_WINDOW_MS = 1_000;
export const NETWORK_CORRELATION_WINDOW_MS = 1_000;

const endpointFor = (rawUrl: string): string => {
  try {
    const url = new URL(rawUrl);
    return `${url.pathname}${url.search}`;
  } catch {
    return rawUrl;
  }
};

const requestIdentity = (request: NetworkRecord): string => {
  try {
    const url = new URL(request.url);
    url.hash = '';
    return `${request.method.toUpperCase()} ${url.toString()}`;
  } catch {
    return `${request.method.toUpperCase()} ${request.url}`;
  }
};

const numericFilter = /^(status|time):(>=|<=|>|<|=)?(\d+(?:\.\d+)?)$/i;
const textFilter = /^(method|domain|url|type):(.+)$/i;

export function parseSmartNetworkQuery(query: string): SmartNetworkQuery {
  const filters: SmartFilter[] = [];
  const terms: string[] = [];
  const highlightTerms = new Set<string>();
  const tokens = query.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];

  for (const rawToken of tokens) {
    const token = rawToken.replace(/^"|"$/g, '').trim();
    if (!token) continue;
    const numeric = token.match(numericFilter);
    if (numeric) {
      filters.push({ field: numeric[1].toLowerCase() as 'status' | 'time', operator: (numeric[2] || '=') as NumericOperator, value: Number(numeric[3]) });
      continue;
    }
    const text = token.match(textFilter);
    if (text) {
      const value = text[2].replace(/^"|"$/g, '').toLowerCase();
      filters.push({ field: text[1].toLowerCase() as 'method' | 'domain' | 'url' | 'type', value });
      if ((text[1].toLowerCase() === 'url' || text[1].toLowerCase() === 'domain') && value) highlightTerms.add(value);
      continue;
    }
    const value = token.toLowerCase();
    terms.push(value);
    highlightTerms.add(value);
  }
  return { filters, terms, highlightTerms: [...highlightTerms].sort((a, b) => b.length - a.length) };
}

const compareNumber = (actual: number, operator: NumericOperator, expected: number): boolean => {
  if (operator === '>') return actual > expected;
  if (operator === '>=') return actual >= expected;
  if (operator === '<') return actual < expected;
  if (operator === '<=') return actual <= expected;
  return actual === expected;
};

const requestType = (request: NetworkRecord): string => request.resourceType === 'xmlhttprequest' ? 'xhr' : request.resourceType.toLowerCase();

const matchesPreset = (request: NetworkRecord, preset: NetworkFilterPreset, duplicates: Map<string, DuplicateRequestInfo>): boolean => {
  if (preset === 'All') return true;
  if (preset === 'Errors') return request.status === 0 || request.status >= 400;
  if (preset === 'Slow') return request.duration > 500;
  if (preset === 'Duplicates') return duplicates.has(request.id);
  if (preset === 'Fetch/XHR') return ['fetch', 'xhr'].includes(requestType(request));
  if (preset === 'Auth') {
    const headers = [...request.requestHeaders, ...request.responseHeaders];
    return request.status === 401 || request.status === 403
      || headers.some(({ name }) => /^(authorization|proxy-authorization|www-authenticate)$/i.test(name))
      || /(?:^|[/?_.-])(auth|login|logout|token|oauth|session)(?:$|[/?_.-])/i.test(request.url);
  }
  return request.method.toUpperCase() === preset;
};

export function matchesSmartNetworkQuery(
  request: NetworkRecord,
  query: SmartNetworkQuery,
  preset: NetworkFilterPreset,
  duplicates: Map<string, DuplicateRequestInfo>
): boolean {
  if (!matchesPreset(request, preset, duplicates)) return false;
  let parsedUrl: URL | undefined;
  const getUrl = (): URL | undefined => {
    if (parsedUrl) return parsedUrl;
    try { parsedUrl = new URL(request.url); } catch { return undefined; }
    return parsedUrl;
  };
  for (const filter of query.filters) {
    if (filter.field === 'status' && !compareNumber(request.status, filter.operator, filter.value)) return false;
    if (filter.field === 'time' && !compareNumber(request.duration, filter.operator, filter.value)) return false;
    if (filter.field === 'method' && request.method.toLowerCase() !== filter.value) return false;
    if (filter.field === 'type' && requestType(request) !== filter.value.replace('xmlhttprequest', 'xhr')) return false;
    if (filter.field === 'url' && !request.url.toLowerCase().includes(filter.value)) return false;
    if (filter.field === 'domain' && !(getUrl()?.host.toLowerCase().includes(filter.value))) return false;
  }
  if (!query.terms.length) return true;
  const searchable = [
    request.url, request.method, String(request.status), request.requestBody ?? '', request.responseBody ?? '',
    ...request.requestHeaders.flatMap(({ name, value }) => [name, value]),
    ...request.responseHeaders.flatMap(({ name, value }) => [name, value])
  ].join('\n').toLowerCase();
  return query.terms.every((term) => searchable.includes(term));
}

const STATIC_ASSET_EXTENSION = /\.(?:avif|bmp|css|eot|gif|ico|jpe?g|js|mjs|map|mp3|mp4|ogg|otf|png|svg|ttf|wav|webm|webp|woff2?)(?:$|[?#])/i;
const STATIC_CONTENT_TYPE = /^(?:image|audio|video|font)\/|(?:text\/css|javascript|ecmascript|font\/|application\/font|application\/octet-stream)/i;

export function isStaticAssetRequest(url: string, contentType?: string): boolean {
  return STATIC_ASSET_EXTENSION.test(url) || Boolean(contentType && STATIC_CONTENT_TYPE.test(contentType));
}

export function trimCapturedRequests(requests: NetworkRecord[], maximum: number): NetworkRecord[] {
  const limit = Math.max(1, Math.floor(maximum));
  return requests.length > limit ? requests.slice(0, limit) : requests;
}

export function closestUnpairedRequest(
  requests: NetworkRecord[],
  target: Pick<NetworkRecord, 'method' | 'url' | 'startedAt'>,
  side: 'page' | 'web',
  windowMs = NETWORK_CORRELATION_WINDOW_MS
): NetworkRecord | undefined {
  let closest: NetworkRecord | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const request of requests) {
    const paired = side === 'page' ? request.pageTraceId !== undefined : request.webRequestId !== undefined;
    if (paired || request.method !== target.method || request.url !== target.url) continue;
    const distance = Math.abs(request.startedAt - target.startedAt);
    if (distance > windowMs || distance >= closestDistance) continue;
    closest = request;
    closestDistance = distance;
  }
  return closest;
}

export function duplicateRequestMap(
  requests: NetworkRecord[], windowMs = DUPLICATE_REQUEST_WINDOW_MS
): Map<string, DuplicateRequestInfo> {
  const buckets = new Map<string, NetworkRecord[]>();
  const duplicates = new Map<string, DuplicateRequestInfo>();

  for (const request of requests) {
    const key = requestIdentity(request);
    const bucket = buckets.get(key) ?? [];
    bucket.push(request);
    buckets.set(key, bucket);
  }

  for (const bucket of buckets.values()) {
    const ordered = [...bucket].sort((a, b) => a.startedAt - b.startedAt);
    let start = 0;
    while (start < ordered.length) {
      let end = start + 1;
      while (end < ordered.length && ordered[end].startedAt - ordered[start].startedAt <= windowMs) end += 1;
      const group = ordered.slice(start, end);
      if (group.length < 2) {
        start += 1;
        continue;
      }

      const first = group[0];
      const info: DuplicateRequestInfo = {
        method: first.method,
        endpoint: endpointFor(first.url),
        count: group.length,
        windowMs: Math.max(0, group.at(-1)!.startedAt - first.startedAt)
      };
      group.forEach((request) => duplicates.set(request.id, info));
      start = end;
    }
  }

  return duplicates;
}
