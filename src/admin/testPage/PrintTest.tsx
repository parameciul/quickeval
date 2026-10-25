import { useMutation } from '@tanstack/react-query';
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import { printFileUrl } from '../api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// The test with the QR code in the corner of every page, made by the robot
// from the test file, for the teacher to print. It shows under the test file.
export function PrintTest({
  test,
  onChanged,
  onRobot,
}: {
  test: TestInfo;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const api = useApi();
  const retry = useMutation({
    mutationFn: () => api.retryPrint(test.code),
    onSuccess: async (answer) => {
      onRobot(answer.robot);
      await onChanged();
    },
  });
  const { status, fromWord } = test.print;

  return (
    <div className="print-test">
      <strong>Testul pentru tipărit:</strong>
      {test.files.test === null ? (
        <p className="hint">Încarcă testul ca să primești varianta cu cod QR.</p>
      ) : status === 'none' ? (
        <p role="status" className="busy-line">
          <span className="spinner" aria-hidden="true" />
          Se pregătește testul cu cod QR…
        </p>
      ) : status === 'ready' ? (
        <>
          <p>
            <a className="button button-small" href={printFileUrl(test.code)} download>
              Descarcă testul cu cod QR
            </a>
          </p>
          <p className="hint">Codul QR apare în colțul fiecărei pagini.</p>
          {fromWord && (
            <p className="hint">
              PDF-ul a fost făcut din fișierul Word. Verifică-l înainte să-l tipărești. Pentru o copie exactă, încarcă testul ca PDF.
            </p>
          )}
        </>
      ) : (
        <>
          <p>Nu am putut pregăti testul cu cod QR.</p>
          <button type="button" className="button-quiet button-small" disabled={retry.isPending} onClick={() => retry.mutate()}>
            Încearcă din nou
          </button>
          {retry.error && <ErrorMessage error={retry.error} />}
        </>
      )}
    </div>
  );
}
