import type { Header, NetworkRecord } from '../types';

export const formatBytes = (bytes?: number): string => {
  if (bytes === undefined || bytes < 0) return 'Unavailable';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const endpointFor = (rawUrl: string): string => {
  try {
    const url = new URL(rawUrl);
    return `${url.pathname}${url.search}`;
  } catch {
    return rawUrl;
  }
};

export const prettyBody = (body?: string): string => {
  if (!body) return '';
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
};

const headersObject = (headers: Header[]): Record<string, string> =>
  Object.fromEntries(headers.map(({ name, value }) => [name, value]));

export function asCurl(request: NetworkRecord): string {
  const parts = [`curl '${request.url.replaceAll("'", "'\\''")}'`, `-X ${request.method}`];
  request.requestHeaders.forEach(({ name, value }) => parts.push(`-H '${name}: ${value.replaceAll("'", "'\\''")}'`));
  if (request.requestBody) parts.push(`--data-raw '${request.requestBody.replaceAll("'", "'\\''")}'`);
  return parts.join(' \\\n+  ');
}

export function asFetch(request: NetworkRecord): string {
  const options: Record<string, unknown> = { method: request.method };
  if (request.requestHeaders.length) options.headers = headersObject(request.requestHeaders);
  if (request.requestBody) options.body = request.requestBody;
  return `const response = await fetch(${JSON.stringify(request.url)}, ${JSON.stringify(options, null, 2)});\n\nconst data = await response.json();`;
}

export function asAxios(request: NetworkRecord): string {
  const config: Record<string, unknown> = {};
  if (request.requestHeaders.length) config.headers = headersObject(request.requestHeaders);
  const body = request.requestBody ? (() => { try { return JSON.parse(request.requestBody); } catch { return request.requestBody; } })() : undefined;
  const args = ['get', 'delete', 'head'].includes(request.method.toLowerCase())
    ? `${JSON.stringify(request.url)}, ${JSON.stringify(config, null, 2)}`
    : `${JSON.stringify(request.url)}, ${JSON.stringify(body ?? {}, null, 2)}, ${JSON.stringify(config, null, 2)}`;
  return `const response = await axios.${request.method.toLowerCase()}(${args});`;
}
