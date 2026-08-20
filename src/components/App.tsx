import { useEffect, useMemo, useState, type PointerEventHandler } from 'react';
import {
  Activity, AlertCircle, Bug, CheckCircle2, CircleDot, Clipboard, Code2, Database, Download,
  Gauge, Globe2, Pause, Play, RefreshCw, Search, Settings as SettingsIcon,
  ShieldCheck, Trash2, X
} from 'lucide-react';
import { useDevScope } from '../hooks/useDevScope';
import { sendRuntimeMessage } from '../utils/chromeRuntime';
import { CompareView } from './CompareView';
import { DebugRecorderView } from './DebugRecorderView';
import { HarView } from './HarView';
import { ReplayInspector } from './ReplayInspector';
import { RulesView } from './RulesView';
import { StorageView } from './StorageView';
import { getSettings, saveSettings } from '../services/settings';
import type { BugForm, NetworkRecord, RequestInitiatorFrame, Settings } from '../types';
import { copyText, downloadText } from '../utils/clipboard';
import { asAxios, asCurl, asFetch, endpointFor, formatBytes, prettyBody } from '../utils/format';
import { translate, type Language, type Translate } from '../utils/i18n';
import { jiraReport, markdownReport, plainTextReport, slackReport } from '../utils/report';
import { redactText, redactUrl, sanitizeRequest } from '../utils/redaction';
import { duplicateRequestMap, type DuplicateRequestInfo } from '../utils/requestAnalysis';

type Section = 'overview' | 'network' | 'bug' | 'recorder' | 'storage' | 'settings';
type NetworkMode = 'requests' | 'compare' | 'rules' | 'har';
type Filter = 'All' | 'Fetch/XHR' | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'Errors';
type DetailTab = 'Overview' | 'Headers' | 'Request' | 'Response' | 'Timing';
const FILTERS: Filter[] = ['All', 'Fetch/XHR', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'Errors'];
type ScreenshotResult = { dataUrl?: string; error?: string };

type AppProps = {
  mode?: 'popup' | 'panel' | 'floating';
  forcedTabId?: number;
  onClose?: () => void;
  onHeaderPointerDown?: PointerEventHandler<HTMLElement>;
  captureScreenshot?: (tabId: number) => Promise<ScreenshotResult>;
};

const canInspect = (url: string): boolean => /^https?:/i.test(url);
const statusClass = (status: number): string => status >= 500 || status === 0 ? 'status-error' : status >= 400 ? 'status-warning' : status >= 300 ? 'status-info' : 'status-success';

function Status({ request }: { request: NetworkRecord }) {
  return <span className={`status ${statusClass(request.status)}`}>{request.status || 'ERR'}</span>;
}

function CopyButton({ label, value, onCopied }: { label: string; value: string; onCopied: (label: string) => void }) {
  return <button className="button secondary compact" onClick={() => void copyText(value).then(() => onCopied(label))}><Clipboard size={14} />{label}</button>;
}

const initiatorSource = (frame: RequestInitiatorFrame): string => {
  let source = frame.source;
  try {
    const url = new URL(frame.source);
    source = decodeURIComponent(url.pathname).replace(/^\/+/, '') || url.host || frame.source;
  } catch { /* Keep non-URL stack sources exactly as Chrome reported them. */ }
  return `${source}${frame.line === undefined ? '' : `:${frame.line}${frame.column === undefined ? '' : `:${frame.column}`}`}`;
};

const initiatorFunction = (name: string): string => name.endsWith(')') ? name : `${name}()`;

function RequestOrigin({ request, duplicate, t }: { request: NetworkRecord; duplicate?: DuplicateRequestInfo; t: Translate }) {
  const trigger = request.triggeredBy;
  const triggerKind = trigger?.action === 'submit' ? t('debugSubmit') : t('debugClick');
  const triggerLabel = trigger?.label ?? (trigger?.action === 'submit' ? t('unnamedForm') : t('unnamedControl'));
  const duplicateSummary = duplicate && t('duplicateRequestSummary')
    .replace('{method}', duplicate.method)
    .replace('{endpoint}', endpointFor(request.url))
    .replace('{count}', String(duplicate.count))
    .replace('{duration}', String(Math.round(duplicate.windowMs)));

  return <div className="request-origin-panel">
    {duplicate && <div className="duplicate-warning"><AlertCircle size={17} /><div><strong>{t('duplicateRequestDetected')}</strong><span>{duplicateSummary}</span></div></div>}
    <div className="request-origin-grid">
      <section>
        <h3>{t('triggeredBy')}</h3>
        {trigger ? <p><strong>{triggerKind}</strong><span>→</span><q>{triggerLabel}</q></p> : <em>{t('recorderActionUnavailable')}</em>}
      </section>
      <section>
        <h3>{t('initiator')}</h3>
        {request.initiator?.frames.length ? <ol className="initiator-stack">
          {request.initiator.frames.map((frame, index) => <li key={`${frame.source}-${frame.line}-${frame.column}-${index}`}>
            <code title={frame.source}>{initiatorSource(frame)}</code>
            {frame.functionName && <span>→ {initiatorFunction(frame.functionName)}</span>}
          </li>)}
          <li className="initiator-terminal">→ {request.initiator.type === 'fetch' ? 'fetch()' : 'XMLHttpRequest.send()'}</li>
        </ol> : <em>{t('initiatorUnavailable')}</em>}
      </section>
    </div>
  </div>;
}

function RequestDetails({ request, duplicate, tabId, reveal, onClose, t, language }: { request: NetworkRecord; duplicate?: DuplicateRequestInfo; tabId?: number; reveal: boolean; onClose: () => void; t: Translate; language: Language }) {
  const [tab, setTab] = useState<DetailTab>('Overview');
  const [showReplay, setShowReplay] = useState(false);
  const [copied, setCopied] = useState('');
  const safe = sanitizeRequest(request, reveal);
  const copiedNotice = (label: string): void => { setCopied(t('copied').replace('{item}', label)); window.setTimeout(() => setCopied(''), 1600); };
  const bodyPanel = (body: string | undefined, empty: string) => body
    ? <pre className="code-block">{prettyBody(body)}</pre>
    : <div className="inline-empty">{empty}</div>;

  const detailTabs: Array<{ id: DetailTab; label: string }> = [
    { id: 'Overview', label: t('overview') }, { id: 'Headers', label: t('headers') },
    { id: 'Request', label: t('request') }, { id: 'Response', label: t('response') }, { id: 'Timing', label: t('timing') }
  ];
  return <section className="detail-pane" aria-label={t('requestDetails')}>
    <div className="detail-heading">
      <div><span className={`method method-${safe.method.toLowerCase()}`}>{safe.method}</span><h2>{endpointFor(safe.url)}</h2></div>
      <div className="detail-heading-actions"><button className="button secondary compact" onClick={() => setShowReplay((value) => !value)}><Play size={14} />{t('editResend')}</button><button className="icon-button" title={t('closeDetails')} aria-label={t('closeDetails')} onClick={onClose}><X size={18} /></button></div>
    </div>
    <RequestOrigin request={safe} duplicate={duplicate} t={t} />
    <div className="detail-tabs" role="tablist">
      {detailTabs.map(({ id, label }) =>
        <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    <div className="detail-content">
      {tab === 'Overview' && <dl className="definition-grid">
        <dt>{t('requestUrl')}</dt><dd className="break-all">{safe.url}</dd>
        <dt>{t('method')}</dt><dd>{safe.method}</dd>
        <dt>{t('status')}</dt><dd><Status request={safe} /> {safe.statusText}</dd>
        <dt>{t('duration')}</dt><dd>{Math.round(safe.duration)} ms</dd>
        <dt>{t('timestamp')}</dt><dd>{new Date(safe.startedAt).toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US')}</dd>
        <dt>{t('contentType')}</dt><dd>{safe.contentType || t('unavailable')}</dd>
        <dt>{t('requestSize')}</dt><dd>{safe.requestSize === undefined ? t('unavailable') : formatBytes(safe.requestSize)}</dd>
        <dt>{t('responseSize')}</dt><dd>{safe.responseSize === undefined ? t('unavailable') : formatBytes(safe.responseSize)}</dd>
      </dl>}
      {tab === 'Headers' && <div className="headers-view">
        <h3>{t('requestHeaders')}</h3>{safe.requestHeaders.length ? <dl>{safe.requestHeaders.map((header, i) => <div key={`${header.name}-${i}`}><dt>{header.name}</dt><dd>{header.value}</dd></div>)}</dl> : <div className="inline-empty">{t('requestHeadersUnavailable')}</div>}
        <h3>{t('responseHeaders')}</h3>{safe.responseHeaders.length ? <dl>{safe.responseHeaders.map((header, i) => <div key={`${header.name}-${i}`}><dt>{header.name}</dt><dd>{header.value}</dd></div>)}</dl> : <div className="inline-empty">{t('responseHeadersUnavailable')}</div>}
      </div>}
      {tab === 'Request' && bodyPanel(safe.requestBody, t('noRequestBody'))}
      {tab === 'Response' && <>{safe.truncated && <div className="notice warning">{t('largeBodyTruncated')}</div>}{bodyPanel(safe.responseBody, t('responseUnavailable'))}</>}
      {tab === 'Timing' && <div className="timing"><div style={{ width: `${Math.max(8, Math.min(100, safe.duration / 10))}%` }} /><span>{t('totalDuration')}</span><strong>{Math.round(safe.duration)} ms</strong></div>}
    </div>
    <div className="copy-actions" aria-label={t('copyRequestAs')}>
      <CopyButton label={t('copyUrl')} value={safe.url} onCopied={copiedNotice} />
      <CopyButton label={t('copyEndpoint')} value={endpointFor(safe.url)} onCopied={copiedNotice} />
      <CopyButton label={t('copyRequestBody')} value={safe.requestBody ?? ''} onCopied={copiedNotice} />
      <CopyButton label={t('copyResponse')} value={safe.responseBody ?? ''} onCopied={copiedNotice} />
      <CopyButton label={t('copyCurl')} value={asCurl(safe)} onCopied={copiedNotice} />
      <CopyButton label={t('copyFetch')} value={asFetch(safe)} onCopied={copiedNotice} />
      <CopyButton label={t('copyAxios')} value={asAxios(safe)} onCopied={copiedNotice} />
    </div>
    <div className="toast-slot" aria-live="polite">{copied}</div>
    {showReplay && <ReplayInspector request={request} tabId={tabId} reveal={reveal} t={t} language={language} />}
  </section>;
}

function NetworkView({ requests, tabId, paused, reveal, onPause, onClear, onRefresh, t, language }: {
  requests: NetworkRecord[]; tabId?: number; paused: boolean; reveal: boolean; onPause: (paused: boolean) => void; onClear: () => void; onRefresh: () => Promise<void>; t: Translate; language: Language;
}) {
  const [mode, setMode] = useState<NetworkMode>('requests');
  const [filter, setFilter] = useState<Filter>('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<NetworkRecord>();
  const duplicates = useMemo(() => duplicateRequestMap(requests), [requests]);
  const filtered = useMemo(() => requests.filter((request) => {
    const matchesFilter = filter === 'All' || filter === 'Fetch/XHR' || filter === request.method || (filter === 'Errors' && (request.status >= 400 || request.status === 0));
    const haystack = `${request.method} ${request.status} ${request.url}`.toLowerCase();
    return matchesFilter && haystack.includes(search.toLowerCase());
  }), [filter, requests, search]);

  if (selected) return <RequestDetails request={selected} duplicate={duplicates.get(selected.id)} tabId={tabId} reveal={reveal} onClose={() => setSelected(undefined)} t={t} language={language} />;
  return <section className="network-view">
    <div className="network-mode-tabs segmented-tabs">
      {([['requests', t('requestsTab')], ['compare', t('compareTab')], ['rules', t('rulesTab')], ['har', t('harTab')]] as const).map(([id, label]) => <button key={id} className={mode === id ? 'active' : ''} onClick={() => setMode(id)}>{label}</button>)}
    </div>
    {mode === 'requests' && <><div className="toolbar">
      <label className="search"><Search size={16} /><span className="sr-only">{t('searchRequests')}</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('searchPlaceholder')} /></label>
      <button className="icon-button" title={paused ? t('resumeCapture') : t('pauseCapture')} aria-label={paused ? t('resumeCapture') : t('pauseCapture')} onClick={() => onPause(!paused)}>{paused ? <Play size={17} /> : <Pause size={17} />}</button>
      <button className="icon-button" title={t('clearRequests')} aria-label={t('clearCaptured')} onClick={onClear}><Trash2 size={17} /></button>
    </div>
    <div className="filters" aria-label={t('networkFilters')}>{FILTERS.map((name) => <button key={name} className={filter === name ? 'active' : ''} onClick={() => setFilter(name)}>{name === 'All' ? t('all') : name === 'Errors' ? t('errors') : name}</button>)}</div>
    {paused && <div className="notice"><Pause size={15} /> {t('capturePaused')}</div>}
    <div className="request-list" role="list">
      {filtered.map((request) => <button className={`request-row${duplicates.has(request.id) ? ' duplicate' : ''}`} key={request.id} onClick={() => setSelected(request)} role="listitem">
        <span className={`method method-${request.method.toLowerCase()}`}>{request.method}</span>
        <span className="endpoint"><strong><span>{endpointFor(request.url)}</span>{duplicates.has(request.id) && <mark title={t('duplicateRequestDetected')}>×{duplicates.get(request.id)!.count}</mark>}</strong><small>{new URL(request.url).host}</small></span>
        <Status request={request} />
        <span className="duration">{Math.round(request.duration)} ms</span>
      </button>)}
      {!filtered.length && <div className="empty-state"><Activity size={28} /><h2>{requests.length ? t('noMatchingRequests') : t('noRequestsYet')}</h2><p>{requests.length ? t('adjustFilters') : t('startCapturing')}</p></div>}
    </div></>}
    {mode === 'compare' && <CompareView requests={requests} reveal={reveal} t={t} />}
    {mode === 'rules' && <RulesView t={t} />}
    {mode === 'har' && <HarView requests={requests} tabId={tabId} reveal={reveal} onImported={onRefresh} t={t} />}
  </section>;
}

function OverviewView({ url, requests, errors, onNavigate, t }: { url: string; requests: NetworkRecord[]; errors: number; onNavigate: (section: Section) => void; t: Translate }) {
  const failed = requests.filter((request) => request.status >= 400 || request.status === 0);
  return <section className="overview">
    <div className="page-identity"><Globe2 size={20} /><div><span>{t('currentPage')}</span><strong title={url}>{url || t('unavailable')}</strong></div></div>
    <div className="metric-strip">
      <div><span>{t('requests')}</span><strong>{requests.length}</strong></div>
      <div><span>{t('failed')}</span><strong className={failed.length ? 'danger-text' : ''}>{failed.length}</strong></div>
      <div><span>{t('consoleErrors')}</span><strong className={errors ? 'danger-text' : ''}>{errors}</strong></div>
    </div>
    <div className="primary-actions">
      <button className="button primary" onClick={() => onNavigate('network')}><Activity size={17} />{t('inspectNetwork')}</button>
      <button className="button secondary" onClick={() => onNavigate('bug')}><Bug size={17} />{t('createBugReport')}</button>
    </div>
    <div className="section-heading"><h2>{t('recentFailed')}</h2>{failed.length > 0 && <button className="text-button" onClick={() => onNavigate('network')}>{t('viewAll')}</button>}</div>
    {failed.slice(0, 4).map((request) => <div className="failure-row" key={request.id}><span className="method">{request.method}</span><strong>{endpointFor(request.url)}</strong><Status request={request} /><span>{Math.round(request.duration)} ms</span></div>)}
    {!failed.length && <div className="healthy"><CheckCircle2 size={24} /><div><strong>{t('noErrors')}</strong><span>{t('healthyPage')}</span></div></div>}
  </section>;
}

const INITIAL_FORM: BugForm = { title: '', description: '', steps: '', expected: '', actual: '', severity: 'Medium' };

function BugReportView({ tabId, pageInfo, requests, consoleItems, reveal, t, language, captureScreenshot }: {
  tabId?: number; pageInfo: ReturnType<typeof useDevScope>['snapshot']['pageInfo']; requests: NetworkRecord[]; consoleItems: ReturnType<typeof useDevScope>['snapshot']['console']; reveal: boolean; t: Translate; language: Language; captureScreenshot: (tabId: number) => Promise<ScreenshotResult>;
}) {
  const [form, setForm] = useState<BugForm>(INITIAL_FORM);
  const failed = requests.filter((request) => request.status >= 400 || request.status === 0).slice(0, 20);
  const [attached, setAttached] = useState<Set<string>>(() => new Set(failed.map((request) => request.id)));
  const [screenshot, setScreenshot] = useState('');
  const [captureError, setCaptureError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const safeRequests = requests.filter((request) => attached.has(request.id)).map((request) => sanitizeRequest(request, reveal));
  const safePageInfo = pageInfo && !reveal ? { ...pageInfo, url: redactUrl(pageInfo.url) } : pageInfo;
  const safeConsole = consoleItems.filter((item) => item.level === 'error').slice(0, 20).map((item) =>
    reveal ? item : { ...item, message: redactText(item.message) }
  );
  const reportInput = { form, pageInfo: safePageInfo, requests: safeRequests, console: safeConsole, screenshot, language };
  const patchForm = <K extends keyof BugForm>(key: K, value: BugForm[K]): void => setForm((current) => ({ ...current, [key]: value }));
  const capture = async (): Promise<void> => {
    if (tabId === undefined) return;
    setBusy(true); setCaptureError('');
    try {
      const result = await captureScreenshot(tabId);
      if (result.error) setCaptureError(result.error); else setScreenshot(result.dataUrl ?? '');
    } catch (reason) {
      setCaptureError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };
  const doCopy = async (label: string, text: string): Promise<void> => { await copyText(text); setNotice(t('copied').replace('{item}', label)); window.setTimeout(() => setNotice(''), 1600); };
  const toggleAttached = (id: string): void => setAttached((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });

  return <section className="bug-report">
    <div className="summary-band">
      <div><AlertCircle size={17} /><strong>{consoleItems.filter((item) => item.level === 'error').length}</strong><span>{t('consoleErrors')}</span></div>
      <div><Activity size={17} /><strong>{failed.length}</strong><span>{t('failed')}</span></div>
      <div><AlertCircle size={17} /><strong>{consoleItems.filter((item) => item.level === 'warn').length}</strong><span>{t('warnings')}</span></div>
    </div>
    <div className="form-grid">
      <label>{t('title')}<input value={form.title} onChange={(event) => patchForm('title', event.target.value)} placeholder={t('titlePlaceholder')} /></label>
      <label>{t('severity')}<select value={form.severity} onChange={(event) => patchForm('severity', event.target.value as BugForm['severity'])}><option value="Low">{t('low')}</option><option value="Medium">{t('medium')}</option><option value="High">{t('high')}</option><option value="Critical">{t('critical')}</option></select></label>
      <label className="span-2">{t('description')}<textarea value={form.description} onChange={(event) => patchForm('description', event.target.value)} rows={3} /></label>
      <label className="span-2">{t('steps')}<textarea value={form.steps} onChange={(event) => patchForm('steps', event.target.value)} rows={4} placeholder={t('stepsPlaceholder')} /></label>
      <label>{t('expected')}<textarea value={form.expected} onChange={(event) => patchForm('expected', event.target.value)} rows={3} /></label>
      <label>{t('actual')}<textarea value={form.actual} onChange={(event) => patchForm('actual', event.target.value)} rows={3} /></label>
    </div>
    <div className="report-section"><div className="section-heading"><h2>{t('screenshot')}</h2>{screenshot && <button className="text-button danger-text" onClick={() => setScreenshot('')}>{t('remove')}</button>}</div>
      {screenshot ? <img className="screenshot" src={screenshot} alt={t('screenshot')} /> : <button className="capture-area" disabled={busy} onClick={() => void capture()}><Gauge size={22} /><strong>{busy ? t('capturing') : t('captureVisible')}</strong><span>{t('captureVisibleDetail')}</span></button>}
      <div className="full-page-unavailable"><button className="button secondary" disabled>{t('captureFullPage')}</button><span>{t('fullPageUnavailable')}</span></div>
      {captureError && <div className="notice warning">{captureError}</div>}
    </div>
    <div className="report-section"><h2>{t('attachNetwork')}</h2>{failed.length ? <div className="attach-list">{failed.map((request) => <label key={request.id}><input type="checkbox" checked={attached.has(request.id)} onChange={() => toggleAttached(request.id)} /><span className="method">{request.method}</span><span>{endpointFor(request.url)}</span><Status request={request} /></label>)}</div> : <div className="inline-empty">{t('noFailedToAttach')}</div>}</div>
    <div className="report-section"><h2>{t('detectedConsole')}</h2>{consoleItems.length ? <div className="console-list">{consoleItems.slice(0, 20).map((item) => <div key={item.id}><span className={`console-level ${item.level}`}>{item.level}</span><code>{reveal ? item.message : redactText(item.message)}</code><time>{new Date(item.timestamp).toLocaleTimeString(language === 'tr' ? 'tr-TR' : 'en-US')}</time></div>)}</div> : <div className="inline-empty">{t('noConsoleEvents')}</div>}</div>
    <div className="export-actions">
      <button className="button primary" onClick={() => void doCopy(t('markdown'), markdownReport(reportInput))}><Clipboard size={15} />{t('copyMarkdown')}</button>
      <button className="button secondary" onClick={() => void doCopy(t('plainText'), plainTextReport(reportInput))}>{t('plainText')}</button>
      <button className="button secondary" onClick={() => void doCopy(t('jiraReport'), jiraReport(reportInput))}>Jira</button>
      <button className="button secondary" onClick={() => void doCopy(t('githubIssue'), markdownReport(reportInput))}>GitHub</button>
      <button className="button secondary" onClick={() => void doCopy(t('slackReport'), slackReport(reportInput))}>Slack</button>
      <button className="button secondary" onClick={() => downloadText(`devscope-${Date.now()}.md`, markdownReport(reportInput))}><Download size={15} />{t('download')}</button>
    </div>
    <div className="toast-slot" aria-live="polite">{notice}</div>
  </section>;
}

function SettingsView({ settings, onChange, onClear, t }: { settings: Settings; onChange: (settings: Settings) => void; onClear: () => void; t: Translate }) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]): void => onChange({ ...settings, [key]: value });
  return <section className="settings-view">
    <div className="settings-group"><h2>{t('language')}</h2>
      <label className="number-row"><span><strong>{t('language')}</strong><small>{t('languageDetail')}</small></span><select value={settings.language} onChange={(event) => set('language', event.target.value as Language)}><option value="en">{t('english')}</option><option value="tr">{t('turkish')}</option></select></label>
    </div>
    <div className="settings-group"><h2>{t('privacy')}</h2>
      <label className="toggle-row"><span><strong>{t('redactSensitive')}</strong><small>{t('redactSensitiveDetail')}</small></span><input type="checkbox" checked={settings.redactSensitiveInformation} onChange={(event) => set('redactSensitiveInformation', event.target.checked)} /></label>
      <label className="toggle-row"><span><strong>{t('revealSensitive')}</strong><small>{t('revealSensitiveDetail')}</small></span><input type="checkbox" checked={settings.revealSensitiveValues} disabled={settings.redactSensitiveInformation} onChange={(event) => set('revealSensitiveValues', event.target.checked)} /></label>
    </div>
    <div className="settings-group"><h2>{t('capture')}</h2>
      <label className="toggle-row"><span><strong>{t('captureConsole')}</strong><small>{t('captureConsoleDetail')}</small></span><input type="checkbox" checked={settings.captureConsoleErrors} onChange={(event) => set('captureConsoleErrors', event.target.checked)} /></label>
      <label className="toggle-row"><span><strong>{t('captureNetwork')}</strong><small>{t('captureNetworkDetail')}</small></span><input type="checkbox" checked={settings.captureNetworkRequests} onChange={(event) => set('captureNetworkRequests', event.target.checked)} /></label>
      <label className="number-row"><span><strong>{t('maximumRequests')}</strong><small>{t('maximumRequestsDetail')}</small></span><input type="number" min="25" max="500" step="25" value={settings.maximumStoredRequests} onChange={(event) => set('maximumStoredRequests', Math.max(25, Math.min(500, Number(event.target.value))))} /></label>
    </div>
    <div className="privacy-note"><ShieldCheck size={20} /><div><strong>{t('browserPrivacy')}</strong><span>{t('browserPrivacyDetail')}</span></div></div>
    <button className="button danger-button" onClick={onClear}><Trash2 size={16} />{t('clearCaptured')}</button>
  </section>;
}

export function App({ mode = 'popup', forcedTabId, onClose, onHeaderPointerDown, captureScreenshot }: AppProps) {
  const [section, setSection] = useState<Section>('overview');
  const [settings, setSettings] = useState<Settings>();
  const { tabId, tabUrl, snapshot, loading, error, refresh, clear, setPaused, startRecording, stopRecording, clearDebugSession } = useDevScope(forcedTabId);
  useEffect(() => { void getSettings().then(setSettings).catch(() => undefined); }, []);
  const updateSettings = (value: Settings): void => { setSettings(value); void saveSettings(value).catch(() => undefined); };
  const language = settings?.language ?? 'en';
  const t: Translate = (key) => translate(language, key);
  useEffect(() => {
    if (mode !== 'floating') document.documentElement.lang = language;
  }, [language, mode]);
  const reveal = Boolean(settings && !settings.redactSensitiveInformation && settings.revealSensitiveValues);
  const currentUrl = snapshot.pageInfo?.url ?? tabUrl;
  const supported = canInspect(currentUrl);

  const takeScreenshot = captureScreenshot ?? (async (targetTabId: number) =>
    sendRuntimeMessage<ScreenshotResult>({ type: 'CAPTURE_SCREENSHOT', tabId: targetTabId })
  );

  return <div className={`app app-${mode}`} lang={language}>
    <header className="app-header" onPointerDown={onHeaderPointerDown}><button className="brand" onClick={() => setSection('overview')} aria-label={`DevScope ${t('overview')}`}><span className="brand-mark"><Code2 size={18} /></span><span><strong>DevScope</strong><small>{t('tagline')}</small></span></button><div className="app-header-actions"><button className="icon-button" title={t('refreshData')} aria-label={t('refreshData')} onClick={() => void refresh()}><RefreshCw size={17} /></button>{mode === 'floating' && <button className="icon-button" title={t('closeDevScope')} aria-label={t('closeDevScope')} onClick={onClose}><X size={18} /></button>}</div></header>
    <nav className="main-nav" aria-label={t('mainNavigation')}>
      {([
        ['overview', Gauge, t('overview')], ['network', Activity, t('network')], ['bug', Bug, t('bugReport')], ['recorder', CircleDot, t('recorder')], ['storage', Database, t('storage')], ['settings', SettingsIcon, t('settings')]
      ] as const).map(([id, Icon, label]) => <button key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)}><Icon size={16} /><span>{label}</span></button>)}
    </nav>
    <main>
      {loading && <div className="loading"><span /><p>{t('loading')}</p></div>}
      {!loading && error && <div className="empty-state error-state"><AlertCircle size={28} /><h2>{t('loadError')}</h2><p>{error}</p><button className="button secondary" onClick={() => void refresh()}>{t('tryAgain')}</button></div>}
      {!loading && !error && !supported && section !== 'settings' && <div className="empty-state"><Globe2 size={28} /><h2>{t('cannotInspect')}</h2><p>{t('cannotInspectDetail')}</p></div>}
      {!loading && !error && (supported || section === 'settings') && <>
        {section === 'overview' && <OverviewView url={currentUrl} requests={snapshot.requests} errors={snapshot.console.filter((item) => item.level === 'error').length} onNavigate={setSection} t={t} />}
        {section === 'network' && <NetworkView requests={snapshot.requests} tabId={tabId} paused={snapshot.paused} reveal={reveal} onPause={(value) => void setPaused(value)} onClear={() => void clear()} onRefresh={refresh} t={t} language={language} />}
        {section === 'bug' && <BugReportView tabId={tabId} pageInfo={snapshot.pageInfo} requests={snapshot.requests} consoleItems={snapshot.console} reveal={reveal} t={t} language={language} captureScreenshot={takeScreenshot} />}
        {section === 'recorder' && <DebugRecorderView session={snapshot.debugSession} pageInfo={snapshot.pageInfo} language={language} t={t} onStart={startRecording} onStop={stopRecording} onClear={clearDebugSession} />}
        {section === 'storage' && <StorageView tabId={tabId} reveal={reveal} t={t} language={language} />}
        {section === 'settings' && settings && <SettingsView settings={settings} onChange={updateSettings} onClear={() => void clear()} t={t} />}
      </>}
    </main>
    {section !== 'settings' && <footer><ShieldCheck size={14} />{t('localData')}</footer>}
  </div>;
}
