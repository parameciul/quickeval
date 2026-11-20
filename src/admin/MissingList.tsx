import { missingName, type MissingPart } from './missing.ts';
import { t } from '../i18n/t.ts';

// The orange list of what a test still misses (spec: CES switch and missing
// warnings): under "Creează testul" on Test nou.
// It never blocks: `after` says that the teacher may go on.
export function MissingList({
  missing,
  lead,
  after,
}: {
  missing: MissingPart[];
  // "Încă": the list's title ends in "lipsește:" or "lipsesc:".
  lead: string;
  after: string;
}) {
  if (missing.length === 0) return null;
  return (
    <div className="warning missing-list">
      <p>
        <strong>
          {lead} {missing.length === 1 ? t('lipsește') : t('lipsesc')}:
        </strong>
      </p>
      <ul>
        {missing.map((part) => (
          <li key={part}>{missingName(part)}</li>
        ))}
      </ul>
      <p className="hint">{after}</p>
    </div>
  );
}
