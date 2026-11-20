import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import type { TestVariant } from '../../../shared/files.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { partsOf } from './variant.ts';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { t } from '../../i18n/t.ts';

// The generated barem's controls on the barem row, next to the file button:
// "Generează baremul" (or "Încearcă din nou" after a failure), the waiting
// line, and, for a generated barem nobody checked yet, the warning and "Am
// verificat baremul" (not while a new one is made or its making failed: the
// barem is then the old test's). Replacing a barem asks first, and so does
// clearing a scheduled evaluation; the old barem stays until the new one arrives. The buttons go on the file button's line, the status
// lines and errors below the row. With `variant` "ces": the CES barem, written
// for grading only; it cancels no schedule, and once checked during the
// evaluation, the CES papers that waited for it go to the robot.
export function useGeneratedBarem({
  test,
  variant = 'class',
  onChanged,
  onRobot,
}: {
  test: TestInfo;
  variant?: TestVariant;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}): { buttons: ReactNode; status: ReactNode } {
  const api = useApi();
  const parts = partsOf(test, variant);
  const ces = variant === 'ces';
  const generate = useMutation({
    mutationFn: () => api.generateBarem(test.code, variant),
    onSuccess: async (answer) => {
      onRobot(answer.robot);
      await onChanged();
    },
  });
  const confirm = useMutation({
    mutationFn: () => api.confirmBarem(test.code, parts.filesVersion, variant),
    onSuccess: async (answer) => {
      if (answer.robot !== undefined) onRobot(answer.robot);
      await onChanged();
    },
    // A stale version means the page is old: show the new state, keep the error.
    onError: onChanged,
  });

  const { request, unchecked } = parts.barem;
  const waiting = request === 'requested';
  const failed = request === 'failed';
  const hasTest = parts.files.test !== null;

  const onGenerate = () => {
    const cancelled = !ces && test.evaluationAt ? ` ${t('Programarea evaluării se anulează.')}` : '';
    const question =
      parts.files.barem !== null
        ? t('Înlocuiești {v1} existent cu unul generat? Baremul de acum rămâne până vine cel nou.{cancelled}', { v1: ces ? t('baremul CES') : t('baremul'), cancelled })
        : cancelled
          ? t('Generezi baremul?{cancelled}', { cancelled })
          : null;
    if (question !== null && !window.confirm(question)) return;
    generate.mutate();
  };

  const buttons = (
    <>
      <button type="button" className="button-quiet button-small" disabled={!hasTest || waiting || generate.isPending} onClick={onGenerate}>
        <ActionIcon name={failed ? 'retry' : 'generate'} />
        {failed ? t('Încearcă din nou') : ces ? t('Generează baremul CES') : t('Generează baremul')}
      </button>
      {unchecked && request === 'none' && (
        <button type="button" className="button button-small" disabled={confirm.isPending} onClick={() => confirm.mutate()}>
          <ActionIcon name="check" />
          {ces ? t('Am verificat baremul CES') : t('Am verificat baremul')}
        </button>
      )}
    </>
  );
  const status = (
    <>
      {!hasTest && <p className="hint">{ces ? t('Încarcă întâi testul CES.') : t('Încarcă întâi testul.')}</p>}
      {waiting && (
        <p role="status">
          {!ces
            ? t('Se generează baremul… Durează câteva minute.')
            : test.barem.request === 'requested'
              ? t('Baremul CES se generează după baremul clasei. Durează câteva minute.')
              : t('Se generează baremul CES… Durează câteva minute.')}
        </p>
      )}
      {failed && <p className="alert">{ces ? 'Nu am putut genera baremul CES.' : t('Nu am putut genera baremul.')}</p>}
      {unchecked && request === 'none' && (
        <p className="warning">
          {ces
            ? t('Barem CES generat automat, doar pentru notare. Verifică-l și corectează-l în Word dacă e nevoie.')
            : t('Barem generat automat. Verifică-l și corectează-l în Word dacă e nevoie.')}
        </p>
      )}
      {generate.error && <ErrorMessage error={generate.error} />}
      {confirm.error && <ErrorMessage error={confirm.error} />}
    </>
  );
  return { buttons, status };
}
