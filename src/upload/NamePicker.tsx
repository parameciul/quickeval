import { useState } from 'react';
import type { LinkStudent } from '../../shared/api.ts';

// The class list. A tap on a name asks "Ești tu?" first, because the upload
// then belongs to that name on this phone. Names that already sent their
// upload show ✓ and cannot be picked.
export function NamePicker({
  students,
  message,
  onPick,
}: {
  students: LinkStudent[];
  message: string | null;
  onPick: (student: LinkStudent) => Promise<void>;
}) {
  const [chosen, setChosen] = useState<LinkStudent | null>(null);
  const [busy, setBusy] = useState(false);

  if (chosen) {
    return (
      <section className="confirm-name">
        <h2>Ești {chosen.name}?</h2>
        <div className="big-actions">
          <button
            type="button"
            className="button button-big"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onPick(chosen);
              setBusy(false);
              setChosen(null);
            }}
          >
            Da, încep
          </button>
          <button type="button" className="button-quiet button-big" disabled={busy} onClick={() => setChosen(null)}>
            Nu, aleg alt nume
          </button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2>Alege-ți numele</h2>
      {message && (
        <p className="alert" role="alert">
          {message}
        </p>
      )}
      {students.length === 0 ? (
        <p className="hint">Lista clasei este goală. Spune-i profesorului.</p>
      ) : (
        <ul className="name-list">
          {students.map((student) => (
            <li key={student.id}>
              <button
                type="button"
                className="name-button"
                disabled={student.state === 'done'}
                aria-label={student.state === 'done' ? `${student.name}, a trimis` : undefined}
                onClick={() => setChosen(student)}
              >
                {student.name}
                {student.state === 'done' && <span aria-hidden="true"> ✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
