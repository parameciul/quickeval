import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import type { UsageCounts, UsagePeriod, UsageSource, UsageStats } from '../../../shared/usage.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { t } from '../../i18n/t.ts';

const SOURCES: { value: UsageSource; label: string }[] = [
  { value: 'all', label: t('Toate') },
  { value: 'quick-try', label: t('Teste rapide') },
  { value: 'teachers', label: t('Profesori') },
];

const PERIODS: { value: UsagePeriod; label: string }[] = [
  { value: '7d', label: t('Ultimele 7 zile') },
  { value: '30d', label: t('Ultima lună') },
  { value: '12m', label: t('Ultimul an') },
];

// The columns, in the order of the work a test goes through; tries only for
// the sources that have Quick Try.
const COLUMNS: { name: keyof UsageCounts; label: string }[] = [
  { name: 'papers', label: t('Lucrări') },
  { name: 'barems', label: t('Bareme') },
  { name: 'exerciseLists', label: t('Liste') },
  { name: 'analyses', label: t('Analize') },
  { name: 'prints', label: t('Tipar') },
  { name: 'failed', label: t('Eșuate') },
  { name: 'tokens', label: t('Tokeni') },
  { name: 'tries', label: t('Încercări') },
];

const NUMBER = new Intl.NumberFormat('ro-RO');
const DAY = new Intl.DateTimeFormat('ro-RO', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const MONTH = new Intl.DateTimeFormat('ro-RO', { timeZone: 'UTC', month: 'short', year: 'numeric' });

// "18 nov." for a day, "nov. 2026" for a month.
export function usageKeyLabel(key: string): string {
  return key.length === 7 ? MONTH.format(new Date(`${key}-01T00:00:00Z`)) : DAY.format(new Date(`${key}T00:00:00Z`));
}

const columnsOf = (source: UsageSource) => COLUMNS.filter((column) => column.name !== 'tries' || source !== 'teachers');

// "Statistici" on Setări: the robot's work per day (or month) of a period, for
// Quick Try, the teachers, or both. Nothing is read until the administrator
// presses "Generează", and nothing is read again by itself.
export function UsageSection() {
  const api = useApi();
  const [source, setSource] = useState<UsageSource>('all');
  const [period, setPeriod] = useState<UsagePeriod>('7d');
  const generate = useMutation({ mutationFn: (asked: { source: UsageSource; period: UsagePeriod }) => api.getUsage(asked.source, asked.period) });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    // The button stays enabled while it works (a disabled button loses the
    // keyboard focus), so a second press waits for the first answer.
    if (generate.isPending) return;
    generate.mutate({ source, period });
  };

  return (
    <section className="class-card" aria-labelledby="usage-title">
      <div className="class-card-head">
        <h2 id="usage-title">{t('Statistici de utilizare')}</h2>
      </div>
      <form className="usage-form" onSubmit={submit}>
        <fieldset>
          <legend>{t('Sursa')}</legend>
          {SOURCES.map((option) => (
            <label key={option.value} className="check-label">
              <input type="radio" name="usage-source" value={option.value} checked={source === option.value} onChange={() => setSource(option.value)} />
              {option.label}
            </label>
          ))}
        </fieldset>
        <label className="usage-period">
          {t('Perioada')}
          <select value={period} onChange={(event) => setPeriod(event.target.value as UsagePeriod)}>
            {PERIODS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="button" aria-disabled={generate.isPending || undefined}>
          {t('Generează')}
        </button>
      </form>
      <div aria-live="polite">{generate.isPending && <p className="usage-note">{t('Se generează…')}</p>}</div>
      {generate.error && <ErrorMessage error={generate.error} />}
      {generate.data && !generate.isPending && <UsageResult stats={generate.data} />}
    </section>
  );
}

// The result takes the focus when it arrives, so a screen reader reads its
// heading and a keyboard user starts from it.
function UsageResult({ stats }: { stats: UsageStats }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [stats]);
  const columns = columnsOf(stats.source);
  const most = Math.max(1, ...stats.rows.map((row) => row.papers));
  const sourceLabel = SOURCES.find((option) => option.value === stats.source)!.label;
  const periodLabel = PERIODS.find((option) => option.value === stats.period)!.label;
  return (
    <div className="usage-result">
      <h3 id="usage-result-title" ref={heading} tabIndex={-1}>
        {periodLabel} · {sourceLabel}
      </h3>
      <dl className="usage-totals" aria-label={t('Totaluri')}>
        {columns.map((column) => (
          <div key={column.name}>
            <dt>{column.label}</dt>
            <dd>{NUMBER.format(stats.totals[column.name])}</dd>
          </div>
        ))}
      </dl>
      <div className="table-wrap">
        <table className="usage-table" aria-labelledby="usage-result-title">
          <thead>
            <tr>
              <th scope="col">{stats.period === '12m' ? t('Luna') : t('Ziua')}</th>
              {columns.map((column) => (
                <th key={column.name} scope="col">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">{usageKeyLabel(row.key)}</th>
                {columns.map((column) => (
                  <td key={column.name}>
                    {column.name === 'papers' && (
                      <span className="usage-bar" aria-hidden="true" style={{ inlineSize: `${(100 * row.papers) / most}%` }} />
                    )}
                    {row[column.name] > 0 ? NUMBER.format(row[column.name]) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
