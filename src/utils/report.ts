import type { BugForm, ConsoleRecord, DebugSession, DebugTraceEvent, NetworkRecord, PageInfo } from '../types';
import { endpointFor, prettyBody } from './format';
import { translate, type Language } from './i18n';
import { redactText, redactUrl } from './redaction';

export type ReportInput = {
  form: BugForm;
  pageInfo?: PageInfo;
  requests: NetworkRecord[];
  console: ConsoleRecord[];
  screenshot?: string;
  language: Language;
};

export type DebugSessionReportInput = {
  session: DebugSession;
  pageInfo?: PageInfo;
  language: Language;
};

const environmentLines = (page: PageInfo | undefined, language: Language): string[] => {
  const t = (key: Parameters<typeof translate>[1]): string => translate(language, key);
  if (!page) return [`- ${t('unavailable')}`];
  const chromeVersion = /Chrome\/([\d.]+)/.exec(page.userAgent)?.[1] ?? t('unavailable');
  return [
    `- URL: ${page.url}`,
    `- ${t('page')}: ${page.title || t('untitled')}`,
    `- ${t('browser')}: Chrome ${chromeVersion}`,
    `- ${t('platform')}: ${page.platform || t('unavailable')}`,
    `- ${t('viewport')}: ${page.viewportWidth}x${page.viewportHeight} @ ${page.devicePixelRatio}x`,
    `- ${t('timezone')}: ${page.timezone}`,
    `- ${t('date')}: ${new Date(page.timestamp).toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US')}`,
    `- ${t('userAgent')}: ${page.userAgent}`
  ];
};

export function debugTraceEventText(event: DebugTraceEvent, language: Language): string {
  const t = (key: Parameters<typeof translate>[1]): string => translate(language, key);
  if (event.kind === 'click') return `${t('debugClick')} → ${event.label || t('unnamedControl')}`;
  if (event.kind === 'submit') return `${t('debugSubmit')} → ${event.label || t('unnamedForm')}`;
  if (event.kind === 'navigation') return `${t('debugNavigation')} → ${event.url || t('unavailable')}`;
  if (event.kind === 'request') return `${event.method || 'HTTP'} ${endpointFor(event.url ?? '')}`;
  if (event.kind === 'console') return `${event.level === 'warn' ? t('consoleWarning') : t('consoleError')} → ${event.label || t('unavailable')}`;
  const status = event.status || t('requestError');
  const detail = event.error || event.statusText || '';
  return `${status}${detail ? ` ${detail}` : ''}`.trim();
}

export function debugSessionReport({ session, pageInfo, language }: DebugSessionReportInput): string {
  const t = (key: Parameters<typeof translate>[1]): string => translate(language, key);
  const locale = language === 'tr' ? 'tr-TR' : 'en-US';
  const timeline = [...session.events].sort((a, b) => a.timestamp - b.timestamp).map((event) => {
    const time = new Date(event.timestamp).toLocaleTimeString(locale);
    const prefix = event.relatedActionId ? '  -' : '-';
    return `${prefix} ${time}  ${debugTraceEventText(event, language)}`;
  });
  const safePageInfo = pageInfo ? { ...pageInfo, url: redactUrl(pageInfo.url), title: redactText(pageInfo.title) } : undefined;
  return [
    `# ${t('debugSessionReport')}`,
    `## ${t('environment')}`,
    environmentLines(safePageInfo, language).join('\n'),
    `## ${t('sessionSummary')}`,
    `- ${t('sessionStarted')}: ${session.startedAt ? new Date(session.startedAt).toLocaleString(locale) : t('unavailable')}`,
    `- ${t('sessionEnded')}: ${session.stoppedAt ? new Date(session.stoppedAt).toLocaleString(locale) : t('recording')}`,
    `- ${t('eventCount')}: ${session.events.length}`,
    `## ${t('debugTimeline')}`,
    timeline.length ? timeline.join('\n') : `_${t('noDebugEvents')}_`
  ].join('\n\n');
}

export function markdownReport(input: ReportInput): string {
  const { form, pageInfo, requests, console, screenshot, language } = input;
  const t = (key: Parameters<typeof translate>[1]): string => translate(language, key);
  const severityKey = form.severity.toLowerCase() as 'low' | 'medium' | 'high' | 'critical';
  const requestBlocks = requests.length
    ? requests.map((request) => {
        const response = request.responseBody ? `\n\n${t('reportResponse')}:\n\n\`\`\`${request.contentType?.includes('json') ? 'json' : 'text'}\n${prettyBody(request.responseBody)}\n\`\`\`` : '';
        return `### ${request.method} ${endpointFor(request.url)}\n\n- ${t('status')}: ${request.status || request.error || t('unavailable')}\n- ${t('duration')}: ${Math.round(request.duration)} ms${response}`;
      }).join('\n\n')
    : `_${t('noAttachedRequests')}_`;
  const consoleBlock = console.length
    ? `\`\`\`text\n${console.map((item) => `[${item.level.toUpperCase()}] ${item.message}`).join('\n')}\n\`\`\``
    : `_${t('noConsoleAttached')}_`;
  return [
    `# ${form.title || t('untitledReport')}`,
    `**${t('severity')}:** ${t(severityKey)}`,
    `## ${t('environment')}`, environmentLines(pageInfo, language).join('\n'),
    `## ${t('description')}`, form.description || `_${t('notProvided')}_`,
    `## ${t('steps')}`, form.steps || `_${t('notProvided')}_`,
    `## ${t('expected')}`, form.expected || `_${t('notProvided')}_`,
    `## ${t('actual')}`, form.actual || `_${t('notProvided')}_`,
    `## ${t('attachedRequests')}`, requestBlocks,
    `## ${t('consoleErrors')}`, consoleBlock,
    ...(screenshot ? [`## ${t('screenshot')}`, `![${t('screenshot')}](${screenshot})`] : [])
  ].join('\n\n');
}

export function plainTextReport(input: ReportInput): string {
  const md = markdownReport({ ...input, screenshot: undefined });
  return md.replace(/^#{1,3}\s+/gm, '').replace(/\*\*/g, '').replace(/```\w*\n?/g, '').replace(/```/g, '').replace(/^_([^_]+)_$/gm, '$1');
}

export function jiraReport(input: ReportInput): string {
  const t = (key: Parameters<typeof translate>[1]): string => translate(input.language, key);
  return markdownReport({ ...input, screenshot: undefined })
    .replace(/^# (.+)$/gm, 'h1. $1')
    .replace(/^## (.+)$/gm, 'h2. $1')
    .replace(/^### (.+)$/gm, 'h3. $1')
    .replace(/```(\w*)\n([\s\S]*?)```/g, '{code:$1}\n$2{code}')
    .replace(`**${t('severity')}:**`, `*${t('severity')}:*`);
}

export function slackReport(input: ReportInput): string {
  const t = (key: Parameters<typeof translate>[1]): string => translate(input.language, key);
  const headings = ['environment', 'description', 'steps', 'expected', 'actual', 'attachedRequests', 'consoleErrors'] as const;
  const headingPattern = headings.map((key) => t(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return plainTextReport(input).replace(/^([^\n]+)$/m, '*$1*').replace(new RegExp(`^(${headingPattern})$`, 'gm'), '*$1*');
}
