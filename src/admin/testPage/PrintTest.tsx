import { useMutation } from '@tanstack/react-query';
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import type { TestVariant } from '../../../shared/files.ts';
import { printFileUrl } from '../api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { partsOf } from './variant.ts';

// The test with the QR code in the corner of every page, made by the robot
// from the test file, for the teacher to print. It shows under the test file
// from the moment the test is made: the teacher prints it before the day of
// the test, and starts the test on that day. A draft made before tests got
// their link at once asks for the link with "Pregătește testul cu cod QR".
// With `variant` "ces": the CES test, with the same QR code as the class test.
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

  return (
    <div className="print-test">
      <strong>{ces ? 'Testul CES pentru tipărit:' : 'Testul pentru tipărit:'}</strong>
      {parts.files.test === null ? (
        <p className="hint">{ces ? 'Încarcă testul CES ca să primești varianta cu cod QR.' : 'Încarcă testul ca să primești varianta cu cod QR.'}</p>
      ) : test.uploadToken === null ? (
        <>
          <p>
            <button type="button" className="button-quiet button-small" disabled={retry.isPending} onClick={() => retry.mutate()}>
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
          <p>
            <a className={ces ? 'button-quiet button-small' : 'button button-small'} href={printFileUrl(test.code, variant)} download>
              {ces ? 'Descarcă testul CES cu cod QR' : 'Descarcă testul cu cod QR'}
            </a>
          </p>
          <p className="hint">
            {ces ? 'Același cod QR ca pe testul clasei: elevii cu CES încarcă pe același link.' : 'Codul QR apare în colțul fiecărei pagini.'}
          </p>
          {test.status === 'draft' && (
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
          <button type="button" className="button-quiet button-small" disabled={retry.isPending} onClick={() => retry.mutate()}>
            Încearcă din nou
          </button>
          {retry.error && <ErrorMessage error={retry.error} />}
        </>
      )}
    </div>
  );
}
