import { useMemo, useState } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import type { Header, NetworkRecord, ReplayRequest, ReplayResponse } from '../types';
import { compareNetworkRequests, replayAsComparable } from '../utils/diff';
import { endpointFor, prettyBody } from '../utils/format';
import type { Language, Translate } from '../utils/i18n';
import { redactHeaders, redactText, sanitizeRequest } from '../utils/redaction';
import { DiffView } from './DiffView';

const headersText = (headers: Header[]): string => headers.map(({ name, value }) => `${name}: ${value}`).join('\n');

function parseHeaders(value: string): Header[] | undefined {
  const result: Header[] = [];
  for (const line of value.split(/\r?\n/).filter((item) => item.trim())) {
    const index = line.indexOf(':');
    if (index <= 0) return undefined;
    result.push({ name: line.slice(0, index).trim(), value: line.slice(index + 1).trim() });
  }
  return result;
}

function initialEditor(request: NetworkRecord, reveal: boolean) {
  const safe = sanitizeRequest(request, reveal);
  const url = new URL(safe.url);
  const query = [...url.searchParams.entries()].map(([name, value]) => `${name}=${value}`).join('\n');
  url.search = '';
  return { method: safe.method, url: url.toString(), query, headers: headersText(safe.requestHeaders), body: safe.requestBody ?? '' };
}

export function ReplayInspector({ request, tabId, reveal, t, language }: { request: NetworkRecord; tabId?: number; reveal: boolean; t: Translate; language: Language }) {
  const [editor, setEditor] = useState(() => initialEditor(request, reveal));
  const [response, setResponse] = useState<ReplayResponse>();
  const [sentRequest, setSentRequest] = useState<ReplayRequest>();
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const safeOriginal = sanitizeRequest(request, reveal);
  const diff = useMemo(() => response && sentRequest ? compareNetworkRequests(safeOriginal, replayAsComparable(sentRequest, {
    ...response,
    headers: reveal ? response.headers : redactHeaders(response.headers),
    body: response.body && !reveal ? redactText(response.body) : response.body
  })) : [], [response, sentRequest, reveal, safeOriginal]);

  const send = async (): Promise<void> => {
    setError('');
    let url: URL;
    try {
      url = new URL(editor.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      url.search = '';
      for (const line of editor.query.split(/\r?\n/).filter((item) => item.trim())) {
        const index = line.indexOf('=');
        const name = (index < 0 ? line : line.slice(0, index)).trim();
        if (name) url.searchParams.append(name, index < 0 ? '' : line.slice(index + 1).trim());
      }
    } catch {
      setError(t('invalidUrl'));
      return;
    }
    const headers = parseHeaders(editor.headers);
    if (!headers) {
      setError(t('invalidHeaders'));
      return;
    }
    if (tabId === undefined) {
      setError(t('replayFailed'));
      return;
    }
    const replayRequest: ReplayRequest = { method: editor.method, url: url.toString(), headers, body: editor.body || undefined };
    setSending(true);
    try {
      const result = await chrome.tabs.sendMessage(tabId, { type: 'REPLAY_REQUEST', request: replayRequest }) as ReplayResponse;
      setSentRequest(replayRequest);
      setResponse(result);
      if (result.error) setError(`${t('replayFailed')}: ${result.error === 'REPLAY_TIMEOUT' ? t('replayTimeout') : result.error}`);
    } catch (reason) {
      setError(`${t('replayFailed')}: ${reason instanceof Error ? reason.message : String(reason)}`);
    } finally {
      setSending(false);
    }
  };

  const replayBody = response?.body ? (reveal ? response.body : redactText(response.body)) : undefined;
  const update = (key: keyof typeof editor, value: string): void => setEditor((current) => ({ ...current, [key]: value }));
  return <div className="replay-inspector">
    {!reveal && <div className="notice warning">{t('revealRequired')}</div>}
    <div className="notice">{t('replayHeaderLimitation')}</div>
    <div className="replay-form">
      <label>{t('method')}<select value={editor.method} onChange={(event) => update('method', event.target.value)}>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((method) => <option key={method}>{method}</option>)}</select></label>
      <label className="replay-url">{t('requestUrl')}<input value={editor.url} onChange={(event) => update('url', event.target.value)} /></label>
      <label>{t('queryParameters')}<textarea rows={3} value={editor.query} onChange={(event) => update('query', event.target.value)} /></label>
      <label>{t('headersFormat')}<textarea rows={5} value={editor.headers} onChange={(event) => update('headers', event.target.value)} /></label>
      <label>{t('requestBodyLabel')}<textarea className="mono-input" rows={6} value={editor.body} onChange={(event) => update('body', event.target.value)} /></label>
    </div>
    {error && <div className="notice warning">{error}</div>}
    <button className="button primary" disabled={sending} onClick={() => void send()}>{sending ? <RefreshCw className="spin-icon" size={15} /> : <Play size={15} />}{sending ? t('sending') : t('sendRequest')}</button>
    {response && <>
      <div className="response-compare">
        <section><h3>{t('originalResponse')}</h3><div className="response-meta"><strong>{safeOriginal.status || 'ERR'}</strong><span>{Math.round(safeOriginal.duration)} ms</span></div><pre>{safeOriginal.responseBody ? prettyBody(safeOriginal.responseBody) : t('noResponseBody')}</pre><details><summary>{t('responseHeaders')}</summary><pre>{headersText(safeOriginal.responseHeaders) || t('responseHeadersUnavailable')}</pre></details></section>
        <section><h3>{t('replayResponse')}</h3><div className="response-meta"><strong>{response.status || 'ERR'}</strong><span>{Math.round(response.duration)} ms</span><small>{endpointFor(response.url)}</small></div><pre>{replayBody ? prettyBody(replayBody) : t('noResponseBody')}</pre><details><summary>{t('responseHeaders')}</summary><pre>{headersText(reveal ? response.headers : redactHeaders(response.headers)) || t('responseHeadersUnavailable')}</pre></details></section>
      </div>
      <h3 className="subsection-title">{t('compareRequests')}</h3>
      <DiffView rows={diff} t={t} />
    </>}
  </div>;
}
