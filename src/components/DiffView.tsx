import type { DiffRow, DiffScope } from '../utils/diff';
import type { Translate } from '../utils/i18n';

const scopeKey: Record<DiffScope, Parameters<Translate>[0]> = {
  summary: 'overview',
  requestHeaders: 'requestHeaders',
  requestBody: 'requestBodyLabel',
  responseHeaders: 'responseHeaders',
  responseBody: 'response'
};

export function DiffView({ rows, t }: { rows: DiffRow[]; t: Translate }) {
  if (!rows.length) return <div className="inline-empty">{t('noDifferences')}</div>;
  const scopes = [...new Set(rows.map((row) => row.scope))];
  return <div className="diff-view">
    {scopes.map((scope) => <section key={scope}>
      <h3>{t(scopeKey[scope])}</h3>
      <div className="diff-table">
        <div className="diff-head"><span>{t('field')}</span><span>{t('original')}</span><span>{t('compared')}</span></div>
        {rows.filter((row) => row.scope === scope).map((row) => <div className={`diff-row diff-${row.kind}`} key={`${scope}-${row.field}`}>
          <span><small>{t(row.kind)}</small><code>{row.field === 'status' ? t('status') : row.field === 'duration' ? t('duration') : row.field}</code></span>
          <pre>{row.original ?? '—'}</pre>
          <pre>{row.compared ?? '—'}</pre>
        </div>)}
      </div>
    </section>)}
  </div>;
}
