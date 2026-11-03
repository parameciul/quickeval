import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// The generated barem's controls on the barem row, next to the file button:
// "Generează baremul" (or "Încearcă din nou" after a failure), the waiting
// line, and, for a generated barem nobody checked yet, the warning and "Am
// verificat baremul" (not while a new one is made or its making failed: the
// barem is then the old test's). Replacing a barem asks first, and so does
// clearing a scheduled evaluation; the old barem stays until the new one arrives. The buttons go on the file button's line, the status
// lines and errors below the row.
export function useGeneratedBarem({
  test,
  onChanged,
  onRobot,
}: {
  test: TestInfo;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}): { buttons: ReactNode; status: ReactNode } {
  const api = useApi();
  const generate = useMutation({
    mutationFn: () => api.generateBarem(test.code),
    onSuccess: async (answer) => {
      onRobot(answer.robot);
      await onChanged();
    },
  });
  const confirm = useMutation({
    mutationFn: () => api.confirmBarem(test.code, test.filesVersion),
    onSuccess: onChanged,
    // A stale version means the page is old: show the new state, keep the error.
    onError: onChanged,
  });

  const { request, unchecked } = test.barem;
  const waiting = request === 'requested';
  const failed = request === 'failed';
  const hasTest = test.files.test !== null;

  const onGenerate = () => {
    const cancelled = test.evaluationAt ? ' Programarea evaluării se anulează.' : '';
    const question =
      test.files.barem !== null
        ? `Înlocuiești baremul existent cu unul generat? Baremul de acum rămâne până vine cel nou.${cancelled}`
        : cancelled
          ? `Generezi baremul?${cancelled}`
          : null;
    if (question !== null && !window.confirm(question)) return;
    generate.mutate();
  };

  const buttons = (
    <>
      <button type="button" className="button-quiet button-small" disabled={!hasTest || waiting || generate.isPending} onClick={onGenerate}>
        {failed ? 'Încearcă din nou' : 'Generează baremul'}
      </button>
      {unchecked && request === 'none' && (
        <button type="button" className="button button-small" disabled={confirm.isPending} onClick={() => confirm.mutate()}>
          Am verificat baremul
        </button>
      )}
    </>
  );
  const status = (
    <>
      {!hasTest && <p className="hint">Încarcă întâi testul.</p>}
      {waiting && <p role="status">Se generează baremul… Durează câteva minute.</p>}
      {failed && <p className="alert">Nu am putut genera baremul.</p>}
      {unchecked && request === 'none' && <p className="alert">Barem generat automat. Verifică-l și corectează-l în Word dacă e nevoie.</p>}
      {generate.error && <ErrorMessage error={generate.error} />}
      {confirm.error && <ErrorMessage error={confirm.error} />}
    </>
  );
  return { buttons, status };
}
