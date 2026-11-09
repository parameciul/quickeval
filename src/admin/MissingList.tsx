import { missingName, type MissingPart } from './missing.ts';

// Why each missing part matters, under "Începe testul".
const WHY: Record<MissingPart, string> = {
  test: 'nu ai ce tipări cu codul QR',
  barem: 'lucrările vor aștepta baremul',
  cesTest: 'elevii cu CES nu au ce primi pe hârtie',
  cesBarem: 'lucrările CES vor aștepta baremul CES',
};

// The orange list of what a test still misses (spec: CES switch and missing
// warnings): under "Creează testul" on Test nou, and under "Începe testul".
// It never blocks: `after` says that the teacher may go on.
export function MissingList({
  missing,
  lead,
  after,
  why = false,
}: {
  missing: MissingPart[];
  // "Încă" or "Înainte să începi,": the list's title ends in "lipsește:" or "lipsesc:".
  lead: string;
  after: string;
  why?: boolean;
}) {
  if (missing.length === 0) return null;
  return (
    <div className="warning missing-list">
      <p>
        <strong>
          {lead} {missing.length === 1 ? 'lipsește' : 'lipsesc'}:
        </strong>
      </p>
      <ul>
        {missing.map((part) => (
          <li key={part}>{why ? `${missingName(part)}: ${WHY[part]}` : missingName(part)}</li>
        ))}
      </ul>
      <p className="hint">{after}</p>
    </div>
  );
}
