import { useRef, useState } from 'react';
import { Download, FileUp, ShieldCheck } from 'lucide-react';
import type { ExtensionMessage, NetworkRecord } from '../types';
import { downloadText } from '../utils/clipboard';
import { exportHar, importHar } from '../utils/har';
import type { Translate } from '../utils/i18n';
import { sendRuntimeMessage } from '../utils/chromeRuntime';

export function HarView({ requests, tabId, reveal, onImported, t }: { requests: NetworkRecord[]; tabId?: number; reveal: boolean; onImported: () => Promise<void>; t: Translate }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const doExport = (): void => {
    downloadText(`devscope-${Date.now()}.har`, exportHar(requests, reveal), 'application/json;charset=utf-8');
    setNotice(t('harExported'));
  };
  const doImport = async (file?: File): Promise<void> => {
    if (!file || tabId === undefined) return;
    setError('');
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('INVALID_HAR');
      const imported = importHar(await file.text());
      const result = await sendRuntimeMessage<{ error?: string; count?: number }>({ type: 'IMPORT_REQUESTS', tabId, requests: imported } satisfies ExtensionMessage);
      if (result?.error) throw new Error(result.error);
      await onImported();
      setNotice(t('harImported').replace('{count}', String(result.count ?? imported.length)));
    } catch {
      setError(t('invalidHar'));
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };
  return <section className="tool-view har-view">
    <h2>{t('harTitle')}</h2>
    <p>{t('harDescription')}</p>
    <div className="har-actions">
      <button className="button primary" disabled={!requests.length} onClick={doExport}><Download size={16} />{t('exportHar')}</button>
      <button className="button secondary" onClick={() => inputRef.current?.click()}><FileUp size={16} />{t('importHar')}</button>
      <input ref={inputRef} className="sr-only" type="file" accept=".har,application/json" aria-label={t('chooseHar')} onChange={(event) => void doImport(event.target.files?.[0])} />
    </div>
    <div className="privacy-note"><ShieldCheck size={19} /><div><strong>{t('sensitiveMasked')}</strong><span>{t('browserPrivacyDetail')}</span></div></div>
    {notice && <div className="notice success-notice">{notice}</div>}
    {error && <div className="notice warning">{error}</div>}
  </section>;
}
