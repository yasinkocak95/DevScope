import { useEffect, useState } from 'react';
import { Ban, Clock3, Plus, ServerCog, Trash2 } from 'lucide-react';
import type { ExtensionMessage, RequestRule } from '../types';
import type { Translate } from '../utils/i18n';

export function RulesView({ t }: { t: Translate }) {
  const [rules, setRules] = useState<RequestRule[]>([]);
  const [name, setName] = useState('');
  const [pattern, setPattern] = useState('');
  const [error, setError] = useState('');

  const load = async (): Promise<void> => {
    const result = await chrome.runtime.sendMessage({ type: 'GET_RULES' } satisfies ExtensionMessage) as RequestRule[] & { error?: string };
    if (result?.error) setError(result.error); else setRules(Array.isArray(result) ? result : []);
  };
  useEffect(() => { void load(); }, []);

  const add = async (): Promise<void> => {
    if (!name.trim() || !pattern.trim()) { setError(t('ruleSaveError')); return; }
    const id = Math.max(1000, ...rules.map((rule) => rule.id + 1));
    const rule: RequestRule = { id, name: name.trim(), urlPattern: pattern.trim(), action: 'block', enabled: true, createdAt: Date.now() };
    const result = await chrome.runtime.sendMessage({ type: 'SAVE_RULE', rule } satisfies ExtensionMessage) as RequestRule[] & { error?: string };
    if (result?.error) setError(`${t('ruleSaveError')}: ${result.error}`); else { setRules(result); setName(''); setPattern(''); setError(''); }
  };
  const toggle = async (rule: RequestRule): Promise<void> => {
    const result = await chrome.runtime.sendMessage({ type: 'TOGGLE_RULE', ruleId: rule.id, enabled: !rule.enabled } satisfies ExtensionMessage) as RequestRule[] & { error?: string };
    if (result?.error) setError(result.error === 'RULE_NOT_FOUND' ? t('ruleNotFound') : result.error); else setRules(result);
  };
  const remove = async (ruleId: number): Promise<void> => {
    const result = await chrome.runtime.sendMessage({ type: 'DELETE_RULE', ruleId } satisfies ExtensionMessage) as RequestRule[] & { error?: string };
    if (result?.error) setError(result.error); else setRules(result);
  };

  return <section className="tool-view rules-view">
    <h2>{t('requestRules')}</h2>
    <div className="capability-grid">
      <div><Ban size={18} /><strong>{t('block')}</strong><span className="capability supported">{t('supported')}</span></div>
      <div className="unsupported"><Clock3 size={18} /><strong>{t('delay')}</strong><span>{t('mv3Unavailable')}</span><small>{t('delayLimitation')}</small></div>
      <div className="unsupported"><ServerCog size={18} /><strong>{t('mockResponse')}</strong><span>{t('mv3Unavailable')}</span><small>{t('mockLimitation')}</small></div>
    </div>
    <div className="rule-form">
      <h3>{t('addBlockRule')}</h3>
      <label>{t('ruleName')}<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>{t('urlPattern')}<input value={pattern} onChange={(event) => setPattern(event.target.value)} placeholder={t('rulePatternPlaceholder')} /></label>
      <button className="button primary" onClick={() => void add()}><Plus size={15} />{t('saveRule')}</button>
    </div>
    {error && <div className="notice warning">{error}</div>}
    <div className="rule-list">
      {rules.map((rule) => <div key={rule.id}>
        <input type="checkbox" checked={rule.enabled} aria-label={rule.enabled ? t('disableRule') : t('enableRule')} onChange={() => void toggle(rule)} />
        <span><strong>{rule.name}</strong><code>{rule.urlPattern}</code></span>
        <span className="rule-action">{t('block')}</span>
        <button className="icon-button" title={t('deleteRule')} aria-label={t('deleteRule')} onClick={() => void remove(rule.id)}><Trash2 size={15} /></button>
      </div>)}
      {!rules.length && <div className="inline-empty"><strong>{t('noRules')}</strong><span>{t('noRulesDetail')}</span></div>}
    </div>
  </section>;
}
