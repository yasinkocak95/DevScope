import type { NetworkRecord } from '../types';

export type DuplicateRequestInfo = {
  method: string;
  endpoint: string;
  count: number;
  windowMs: number;
};

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
