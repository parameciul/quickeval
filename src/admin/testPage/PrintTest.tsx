import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import type { TestVariant } from '../../../shared/files.ts';
import { countLabel } from '../../ui/format.ts';
import { printFileUrl } from '../api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { printPdf } from './printPdf.ts';
import { partsOf } from './variant.ts';
import { ActionIcon } from '../../ui/ActionIcon.tsx';

// How many copies to print, in a line: the class without its CES students
// when the test has a CES variant, the CES students for the CES test.
export function copiesLine(test: TestInfo, variant: TestVariant): string | null {
  const ces = test.ces.files.test !== null ? test.ces.studentCount : 0;
  const count = variant === 'ces' ? ces : test.studentCount - ces;
  if (count <= 0) return null;
  const copies = countLabel(count, 'copie', 'copii');
  if (variant === 'ces') return `Tipărește ${copies}, pentru elevii cu CES.`;
  return ces > 0 ? `Tipărește ${copies}, pentru elevii fără CES.` : `Tipărește ${copies}, câte una pentru fiecare elev.`;
}

// The test with the QR code in the corner of every page, made by the robot
// from the test file, for the teacher to print (spec 2026-11-15 §3). It shows
// in Tipărire from the moment the test is made: the teacher prints it before
// the day of the test, and starts the test on that day. A draft made before
// tests got their link at once asks for the link with "Pregătește testul cu
// cod QR". With `variant` "ces": the CES test, with the same QR code as the
// class test.
export function PrintTest({
  test,
  variant = 'class',
  onChanged,
  onRobot,
}: {
  test: TestInfo;
  variant?: TestVariant;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const api = useApi();
  const id = useId();
  const retry = useMutation({
    mutationFn: () => api.retryPrint(test.code, variant),
    onSuccess: async (answer) => {
      onRobot(answer.robot);
      await onChanged();
    },
  });
  const parts = partsOf(test, variant);
  const ces = variant === 'ces';
  const { status, fromWord } = parts.print;
  const ready = parts.files.test !== null && test.uploadToken !== null && status === 'ready';
  const copies = copiesLine(test, variant);

  return (
    <section className={ready ? 'print-card is-ready' : 'print-card'} aria-labelledby={id}>
      {ready && <PageDrawing />}
      <div className="print-body">
        <h4 id={id}>{ces ? 'Testul CES cu cod QR' : 'Testul cu cod QR'}</h4>
        {parts.files.test === null ? (
          <p className="hint">{ces ? 'Încarcă testul CES ca să primești varianta cu cod QR.' : 'Încarcă testul ca să primești varianta cu cod QR.'}</p>
        ) : test.uploadToken === null ? (
          <>
            <p>
              <button type="button" className="button-quiet button-small" disabled={retry.isPending} onClick={() => retry.mutate()}>
                <ActionIcon name="qr" />
                Pregătește testul cu cod QR
              </button>
            </p>
            {retry.error && <ErrorMessage error={retry.error} />}
          </>
        ) : status === 'none' ? (
          <p role="status" className="busy-line">
            <span className="spinner" aria-hidden="true" />
            Se pregătește testul cu cod QR…
          </p>
        ) : status === 'ready' ? (
          <>
            <p className="hint">
              {ces ? 'Același cod QR ca pe testul clasei: elevii cu CES încarcă pe același link.' : 'Codul QR apare în colțul fiecărei pagini.'}
            </p>
            {copies && <p className="hint">{copies}</p>}
            <div className="card-actions">
              <PrintButton url={printFileUrl(test.code, variant)} main={!ces} />
              <a className="button-quiet" href={printFileUrl(test.code, variant)} download>
                <ActionIcon name="download" />
                Descarcă PDF
              </a>
            </div>
            {test.status === 'draft' && !ces && (
              <p className="hint">Poți tipări testul de acum. Elevii încarcă lucrările după ce începi testul.</p>
            )}
            {fromWord && (
              <p className="hint">
                PDF-ul a fost făcut din fișierul Word. Verifică-l înainte să-l tipărești. Pentru o copie exactă, încarcă testul ca PDF.
              </p>
            )}
          </>
        ) : (
          <>
            <p>{ces ? 'Nu am putut pregăti testul CES cu cod QR.' : 'Nu am putut pregăti testul cu cod QR.'}</p>
            <p>
              <button type="button" className="button-quiet button-small" disabled={retry.isPending} onClick={() => retry.mutate()}>
                <ActionIcon name="retry" />
                Încearcă din nou
              </button>
            </p>
            {retry.error && <ErrorMessage error={retry.error} />}
          </>
        )}
      </div>
    </section>
  );
}

// "Tipărește": the computer's print window on the PDF (`printPdf`). While the
// PDF loads, the button says it is getting ready; an answer that is not a PDF
// says so under it.
function PrintButton({ url, main }: { url: string; main: boolean }) {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  return (
    <>
      <button
        type="button"
        className={main ? 'button' : 'button-quiet'}
        disabled={state === 'busy'}
        onClick={async () => {
          setState('busy');
          setState((await printPdf(url)) === 'failed' ? 'failed' : 'idle');
        }}
      >
        <ActionIcon name="print" />
        {state === 'busy' ? 'Se pregătește…' : 'Tipărește'}
      </button>
      {state === 'failed' && (
        <div className="alert print-error" role="alert">
          <p className="alert-text">Nu am putut deschide testul pentru tipărit. Încearcă din nou sau descarcă PDF-ul.</p>
        </div>
      )}
    </>
  );
}

// A page with lines of text and the QR code in its corner: not the PDF itself.
function PageDrawing() {
  return (
    <span className="print-page" aria-hidden="true">
      <svg className="print-page-qr" viewBox="0 0 7 7" focusable="false">
        <path d="M0 0h3v3H0zM4 0h3v3H4zM0 4h3v3H0zM4 4h1v1H4zM6 4h1v1H6zM5 5h1v1H5zM4 6h1v1H4zM6 6h1v1H6z" />
      </svg>
      <span className="print-page-title" />
      {Array.from({ length: 9 }, (_, index) => (
        <span key={index} className={index % 3 === 2 ? 'print-page-line is-short' : 'print-page-line'} />
      ))}
    </span>
  );
}
