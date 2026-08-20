import type { JwtRecord, StorageSnapshot } from '../types';

const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

function decodePart(part: string): Record<string, unknown> {
  const normalized = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

export function inspectJwtStorage(storage: StorageSnapshot): JwtRecord[] {
  const sources = [
    ...storage.local.map((item) => ({ ...item, source: 'localStorage' as const })),
    ...storage.session.map((item) => ({ ...item, source: 'sessionStorage' as const })),
    ...storage.cookies.map((item) => ({ name: item.name, value: item.value, source: 'cookie' as const }))
  ];
  const records: JwtRecord[] = [];
  for (const item of sources) {
    for (const token of item.value.match(JWT_PATTERN) ?? []) {
      try {
        const [headerPart, payloadPart] = token.split('.');
        const header = decodePart(headerPart);
        const payload = decodePart(payloadPart);
        const expiresAt = typeof payload.exp === 'number' ? payload.exp * 1000 : undefined;
        records.push({ source: item.source, name: item.name, token, header, payload, expiresAt, expired: expiresAt ? expiresAt <= Date.now() : undefined });
      } catch { /* Ignore strings that resemble JWTs but cannot be decoded. */ }
    }
  }
  return records;
}
