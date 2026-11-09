import { CesTag } from './CesTag.tsx';

// "Test separat pentru elevii cu CES" (spec: CES switch): on Test nou and in
// the CES block of the test page. On: the CES students get their own test,
// graded with their own barem. Off: they get the class test.
export function CesSwitch({
  names,
  on,
  disabled = false,
  onToggle,
}: {
  // The active CES students of the class.
  names: string[];
  on: boolean;
  disabled?: boolean;
  onToggle: (on: boolean) => void;
}) {
  return (
    <div className="ces-switch">
      <p className="ces-switch-who">
        <strong>
          {names.length === 1 ? 'Clasa are 1 elev cu CES' : `Clasa are ${names.length} elevi cu CES`}
          <CesTag />
        </strong>
        {names.length > 0 && <span className="hint">{names.join(', ')}</span>}
      </p>
      <button type="button" role="switch" aria-checked={on} className="ces-switch-button" disabled={disabled} onClick={() => onToggle(!on)}>
        <span className="switch" aria-hidden="true" />
        <span>Test separat pentru elevii cu CES</span>
      </button>
      <p className="hint">Pornit: elevii cu CES primesc testul lor, corectat cu baremul lor. Oprit: primesc testul clasei.</p>
    </div>
  );
}
