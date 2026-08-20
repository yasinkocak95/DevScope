import { useMemo, useState } from 'react';
import type { NetworkRecord } from '../types';
import { compareNetworkRequests } from '../utils/diff';
import { endpointFor } from '../utils/format';
import type { Translate } from '../utils/i18n';
import { sanitizeRequest } from '../utils/redaction';
import { DiffView } from './DiffView';

export function CompareView({ requests, reveal, t }: { requests: NetworkRecord[]; reveal: boolean; t: Translate }) {
  const [firstId, setFirstId] = useState(requests[0]?.id ?? '');
  const [secondId, setSecondId] = useState(requests[1]?.id ?? '');
  const first = requests.find((request) => request.id === firstId);
  const second = requests.find((request) => request.id === secondId);
  const rows = useMemo(() => first && second && first.id !== second.id
    ? compareNetworkRequests(sanitizeRequest(first, reveal), sanitizeRequest(second, reveal))
    : [], [first, second, reveal]);
  const options = requests.map((request) => <option key={request.id} value={request.id}>{request.method} {request.status || 'ERR'} {endpointFor(request.url)}</option>);

  return <section className="tool-view compare-view">
    <h2>{t('compareRequests')}</h2>
    <div className="compare-selectors">
      <label>{t('firstRequest')}<select value={firstId} onChange={(event) => setFirstId(event.target.value)}><option value="">{t('selectRequest')}</option>{options}</select></label>
      <label>{t('secondRequest')}<select value={secondId} onChange={(event) => setSecondId(event.target.value)}><option value="">{t('selectRequest')}</option>{options}</select></label>
    </div>
    {!first || !second ? <div className="inline-empty">{t('selectTwoRequests')}</div> : first.id === second.id ? <div className="notice warning">{t('sameRequestWarning')}</div> : <DiffView rows={rows} t={t} />}
  </section>;
}
