import { useEffect, useMemo, useState } from 'react';
import { Bug, CircleDot, Clipboard, Download, ShieldCheck, Square, Trash2 } from 'lucide-react';
import type { DebugSession, PageInfo } from '../types';
import { copyText, downloadText } from '../utils/clipboard';
import { debugSessionReport, debugTraceEventText } from '../utils/report';
import type { Language, Translate } from '../utils/i18n';

type DebugRecorderViewProps = {
  session: DebugSession;
  pageInfo?: PageInfo;
  language: Language;
  t: Translate;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
  onClear: () => Promise<void>;
};

export function DebugRecorderView({ session, pageInfo, language, t, onStart, onStop, onClear }: DebugRecorderViewProps) {
  const [generated, setGenerated] = useState('');
  const [notice, setNotice] = useState('');
  const locale = language === 'tr' ? 'tr-TR' : 'en-US';
  const events = useMemo(() => [...session.events].sort((a, b) => a.timestamp - b.timestamp), [session.events]);

  useEffect(() => { setGenerated(''); }, [events.length, session.startedAt, session.stoppedAt]);

  const generate = (): void => {
    setGenerated(debugSessionReport({ session, pageInfo, language }));
    setNotice(t('reportGenerated'));
    window.setTimeout(() => setNotice(''), 2_000);
  };

  const copyReport = async (): Promise<void> => {
    await copyText(generated);
    setNotice(t('copied').replace('{item}', t('generatedReport')));
    window.setTimeout(() => setNotice(''), 1_600);
  };

  return <section className="recorder-view">
    <div className="recorder-heading">
      <div><h2>{t('recordDebugSession')}</h2><p>{t('recorderDescription')}</p></div>
      <span className={`recorder-status ${session.recording ? 'active' : ''}`}><i />{session.recording ? t('recording') : t('recordingStopped')}</span>
    </div>
    <div className="recorder-actions">
      <button className="button primary" disabled={session.recording} onClick={() => void onStart()}><CircleDot size={15} />{t('startRecording')}</button>
      <button className="button secondary" disabled={!session.recording} onClick={() => void onStop()}><Square size={14} />{t('stopRecording')}</button>
      <button className="button secondary" disabled={!session.events.length && !session.startedAt} onClick={() => void onClear()}><Trash2 size={15} />{t('clearSession')}</button>
      <button className="button secondary" disabled={session.recording || !session.events.length} onClick={generate}><Bug size={15} />{t('generateBugReport')}</button>
    </div>
    <div className="recorder-privacy"><ShieldCheck size={17} /><span>{t('recordingPrivacy')}</span></div>
    <div className="section-heading recorder-timeline-heading"><h2>{t('debugTimeline')}</h2><span>{session.events.length}</span></div>
    {events.length ? <ol className="debug-timeline">
      {events.map((event) => <li key={event.id} className={`debug-event debug-event-${event.kind}${event.kind === 'console' ? ` debug-event-console-${event.level}` : ''}${event.relatedActionId ? ' related' : ''}`}>
        <time>{new Date(event.timestamp).toLocaleTimeString(locale)}</time>
        <i />
        <span>{debugTraceEventText(event, language)}</span>
      </li>)}
    </ol> : <div className="empty-state recorder-empty"><CircleDot size={28} /><h2>{t('noDebugEvents')}</h2><p>{t('noDebugEventsDetail')}</p></div>}
    {generated && <div className="generated-report">
      <div className="section-heading"><h2>{t('generatedReport')}</h2></div>
      <pre>{generated}</pre>
      <div className="generated-report-actions">
        <button className="button primary" onClick={() => void copyReport()}><Clipboard size={15} />{t('copyReport')}</button>
        <button className="button secondary" onClick={() => downloadText(`devscope-debug-session-${Date.now()}.md`, generated)}><Download size={15} />{t('downloadReport')}</button>
      </div>
    </div>}
    <div className="toast-slot" aria-live="polite">{notice}</div>
  </section>;
}
