import { useEffect, useMemo, useState } from 'react';
import { Cookie, Database, KeyRound, RefreshCw } from 'lucide-react';
import type { ExtensionMessage, Header, JwtRecord, StorageSnapshot } from '../types';
import type { Language, Translate } from '../utils/i18n';
import { inspectJwtStorage } from '../utils/jwt';
import { redactHeaders, redactText } from '../utils/redaction';
import { sendRuntimeMessage } from '../utils/chromeRuntime';

type StorageTab = 'local' | 'session' | 'cookies' | 'jwt';

function StorageEntries({ entries, reveal, empty, t }: { entries: Header[]; reveal: boolean; empty: string; t: Translate }) {
  if (!entries.length) return <div className="inline-empty">{empty}</div>;
  return <div className="storage-list">{entries.map((entry, index) => {
    const sensitiveName = /(token|auth|password|passwd|secret|api[-_]?key|cookie)/i.test(entry.name);
    const value = reveal ? entry.value : sensitiveName ? '[REDACTED]' : redactHeaders([{ name: entry.name, value: redactText(entry.value) }])[0].value;
    return <details key={`${entry.name}-${index}`}><summary><code>{entry.name}</code><span>{value}</span></summary><pre>{value}</pre></details>;
  })}</div>;
}

function JwtItem({ jwt, reveal, t, language }: { jwt: JwtRecord; reveal: boolean; t: Translate; language: Language }) {
  const sourceLabel = jwt.source === 'localStorage' ? t('localStorage') : jwt.source === 'sessionStorage' ? t('sessionStorage') : t('cookies');
  return <details className="jwt-item">
    <summary><KeyRound size={15} /><span><strong>{jwt.name}</strong><small>{sourceLabel}</small></span><span className={`jwt-status ${jwt.expired ? 'expired' : 'valid'}`}>{jwt.expiresAt ? (jwt.expired ? t('expired') : t('valid')) : t('noExpiration')}</span></summary>
    <div className="jwt-content">
      <label>{t('value')}<pre>{reveal ? jwt.token : '[REDACTED]'}</pre></label>
      <label>{t('jwtHeader')}<pre>{JSON.stringify(jwt.header, null, 2)}</pre></label>
      <label>{t('jwtPayload')}<pre>{JSON.stringify(jwt.payload, null, 2)}</pre></label>
      <div><strong>{t('expires')}:</strong> {jwt.expiresAt ? new Date(jwt.expiresAt).toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US') : t('noExpiration')}</div>
    </div>
  </details>;
}

export function StorageView({ tabId, reveal, t, language }: { tabId?: number; reveal: boolean; t: Translate; language: Language }) {
  const [tab, setTab] = useState<StorageTab>('local');
  const [snapshot, setSnapshot] = useState<StorageSnapshot>({ local: [], session: [], cookies: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const jwts = useMemo(() => inspectJwtStorage(snapshot), [snapshot]);
  const load = async (): Promise<void> => {
    if (tabId === undefined) return;
    setLoading(true); setError('');
    try {
      const result = await sendRuntimeMessage<Partial<StorageSnapshot> & { error?: string }>({ type: 'GET_STORAGE_DATA', tabId } satisfies ExtensionMessage);
      setSnapshot({ local: result.local ?? [], session: result.session ?? [], cookies: result.cookies ?? [] });
      if (result.error) setError(result.error === 'UNSUPPORTED_TAB' ? t('unsupportedStoragePage') : `${t('storageLoadError')} ${result.error}`);
    } catch (reason) {
      setError(`${t('storageLoadError')} ${reason instanceof Error ? reason.message : String(reason)}`);
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [tabId]);
  const tabs: Array<{ id: StorageTab; label: string; count: number }> = [
    { id: 'local', label: t('localStorage'), count: snapshot.local.length },
    { id: 'session', label: t('sessionStorage'), count: snapshot.session.length },
    { id: 'cookies', label: t('cookies'), count: snapshot.cookies.length },
    { id: 'jwt', label: t('jwtTokens'), count: jwts.length }
  ];
  return <section className="storage-view">
    <div className="storage-toolbar"><div className="segmented-tabs">{tabs.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}<span>{item.count}</span></button>)}</div><button className="icon-button" title={t('refreshStorage')} aria-label={t('refreshStorage')} onClick={() => void load()}><RefreshCw size={16} /></button></div>
    {loading && <div className="loading compact-loading"><span /><p>{t('loading')}</p></div>}
    {!loading && error && <div className="notice warning">{error}</div>}
    {!loading && tab === 'local' && <StorageEntries entries={snapshot.local} reveal={reveal} empty={t('noStorageEntries')} t={t} />}
    {!loading && tab === 'session' && <StorageEntries entries={snapshot.session} reveal={reveal} empty={t('noStorageEntries')} t={t} />}
    {!loading && tab === 'cookies' && <div className="cookie-list">{snapshot.cookies.map((cookie, index) => <details key={`${cookie.domain}-${cookie.name}-${index}`}><summary><Cookie size={14} /><code>{cookie.name}</code><span>{reveal ? cookie.value : '[REDACTED]'}</span></summary><dl><dt>{t('domain')}</dt><dd>{cookie.domain}</dd><dt>{t('path')}</dt><dd>{cookie.path}</dd><dt>{t('secure')}</dt><dd>{cookie.secure ? '✓' : '—'}</dd><dt>{t('httpOnly')}</dt><dd>{cookie.httpOnly ? '✓' : '—'}</dd><dt>{t('expires')}</dt><dd>{cookie.expirationDate ? new Date(cookie.expirationDate * 1000).toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US') : t('sessionCookie')}</dd></dl></details>)}{!snapshot.cookies.length && <div className="inline-empty">{t('noCookies')}</div>}</div>}
    {!loading && tab === 'jwt' && <div className="jwt-list">{jwts.map((jwt, index) => <JwtItem key={`${jwt.source}-${jwt.name}-${index}`} jwt={jwt} reveal={reveal} t={t} language={language} />)}{!jwts.length && <div className="inline-empty"><Database size={20} />{t('noJwt')}</div>}</div>}
  </section>;
}
