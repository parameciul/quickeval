import { useMutation } from '@tanstack/react-query';
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// The generated barem's controls on the barem row, next to the file button:
// "Generează baremul" (or "Încearcă din nou" after a failure), the waiting
// line, and, for a generated barem nobody checked yet, the warning and "Am
// verificat baremul". Replacing a barem asks first; the old one stays until
// the new one arrives.
export function GeneratedBarem({
  test,
  onChanged,
  onRobot,
}: {
  test: TestInfo;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
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
  });

  const { request, unchecked } = test.barem;
  const waiting = request === 'requested';
  const failed = request === 'failed';
  const hasTest = test.files.test !== null;

  const onGenerate = () => {
    const replaces = test.files.barem !== null && !failed;
    if (replaces && !window.confirm('Înlocuiești baremul existent cu unul generat? Baremul de acum rămâne până vine cel nou.')) return;
    generate.mutate();
  };

  return (
    <>
      <button type="button" className="button-quiet button-small" disabled={!hasTest || waiting || generate.isPending} onClick={onGenerate}>
        {failed ? 'Încearcă din nou' : 'Generează baremul'}
      </button>
      {!hasTest && <span className="hint">Încarcă întâi testul.</span>}
      {waiting && <span role="status">Se generează baremul… Durează câteva minute.</span>}
      {failed && <span className="alert">Nu am putut genera baremul.</span>}
      {unchecked && !waiting && (
        <>
          <span className="alert">Barem generat automat. Verifică-l și corectează-l în Word dacă e nevoie.</span>
          <button type="button" className="button button-small" disabled={confirm.isPending} onClick={() => confirm.mutate()}>
            Am verificat baremul
          </button>
        </>
      )}
      {generate.error && <ErrorMessage error={generate.error} />}
      {confirm.error && <ErrorMessage error={confirm.error} />}
    </>
  );
}
