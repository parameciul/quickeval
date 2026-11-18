import { useMutation } from '@tanstack/react-query';
import { useId, type ReactNode } from 'react';
import type { TestInfo } from '../../../shared/api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// The "Acum" box at the top of În clasă and Corectare: what is true now (the
// title), the actions of the stage (children), and what comes after it
// ("Urmează"). `band` is the uploads' switch across its top, while the test
// is open.
export function NowBox({
  band,
  label,
  title,
  next,
  children,
}: {
  band?: ReactNode;
  label?: string;
  title: string;
  next?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={band ? 'now-box has-band' : 'now-box'}>
      {band}
      {label && <p className="now-label">{label}</p>}
      <p className="now-title">{title}</p>
      {children}
      {next && (
        <p className="now-next">
          <strong>Urmează</strong> <span>{next}</span>
        </p>
      )}
    </div>
  );
}

// The uploads of an open test as a switch (design Y3): a green band while the
// students may upload, an orange one once the teacher closed the uploads
// without starting the grading ("Închide încărcarea", at the end of the hour).
// On Corectare the open band says that starting the grading closes them too.
export function UploadsBand({ test, onChanged, grading = false }: { test: TestInfo; onChanged: () => Promise<void>; grading?: boolean }) {
  const api = useApi();
  const textId = useId();
  const closed = test.uploadsClosedAt !== null;
  const toggle = useMutation({
    mutationFn: () => api.setUploadsClosed(test.code, !closed),
    onSuccess: onChanged,
  });
  return (
    <>
      <div className={closed ? 'uploads-band is-shut' : 'uploads-band is-open'}>
        <span className="uploads-band-dot" aria-hidden="true" />
        <p id={textId}>
          {closed ? (
            <>
              <strong>Încărcarea e închisă.</strong> Elevii nu pot trimite. O redeschizi oricând.
            </>
          ) : (
            <>
              <strong>Încărcarea e deschisă.</strong> Elevii pot trimite lucrările.
              {grading && ' Când pornești corectarea, se închide singură.'}
            </>
          )}
        </p>
        <button
          type="button"
          role="switch"
          aria-checked={!closed}
          aria-label="Încărcarea lucrărilor"
          aria-describedby={textId}
          className="uploads-toggle"
          disabled={toggle.isPending}
          onClick={() => toggle.mutate()}
        >
          <span className="uploads-toggle-track" aria-hidden="true">
            <span className="uploads-toggle-knob" />
          </span>
          <span aria-hidden="true">{closed ? 'Închisă' : 'Deschisă'}</span>
        </button>
      </div>
      {toggle.error && <ErrorMessage error={toggle.error} />}
    </>
  );
}
