import { useMutation } from '@tanstack/react-query';
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import type { TestVariant } from '../../../shared/files.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { MoveOnLink } from './MoveOnLink.tsx';
import { SubjectChange } from './SubjectForm.tsx';
import { partsOf } from './variant.ts';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { t } from '../../i18n/t.ts';
import { translateMessage } from '../../../shared/i18n/messages.ts';

// The robot reads the test and the barem first and makes a list of the
// exercises (spec §9). Shown only when that list needs the teacher: its
// points do not add up, or the robot could not make it. A list that failed
// because the test's subject is one the robot does not grade (`alta`) says so
// and offers no retry, only "Schimbă materia" for a wrong guess and a new test
// file (only the class list: a CES test has its class test's subject). It
// shows in the panel
// Corectare; the barem is replaced in the panel Pregătire. With `variant`
// "ces": the CES variant's list.
export function ExerciseListBanner({
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
  const onStarted = async (robot: RobotStart | null) => {
    onRobot(robot);
    await onChanged();
  };
  const accept = useMutation({ mutationFn: () => api.acceptExerciseList(test.code, variant), onSuccess: onStarted });
  const retry = useMutation({ mutationFn: () => api.retryExerciseList(test.code, variant), onSuccess: onStarted });
  const { status, message } = partsOf(test, variant).exerciseList;
  const ces = variant === 'ces';

  if (status === 'problem') {
    return (
      <div className="warning">
        <p>
          <strong>{ces ? t('Baremul CES are o problemă.') : t('Baremul are o problemă.')}</strong> {translateMessage(message ?? '')}
        </p>
        <p>{ces ? t('Înlocuiește baremul CES la Pregătire, sau corectează cu el așa cum este.') : t('Înlocuiește baremul la Pregătire, sau corectează cu baremul așa cum este.')}</p>
        <span className="row-actions">
          <button type="button" className="button-quiet button-small" disabled={accept.isPending} onClick={() => accept.mutate()}>
            <ActionIcon name="check" />
            {t('Folosește oricum')}
          </button>
          <MoveOnLink className="button-quiet button-small" stage={'Pregătire'}>
            <ActionIcon name="upload" />
            {ces ? t('Înlocuiește baremul CES') : t('Înlocuiește baremul')}
          </MoveOnLink>
        </span>
        {accept.error && <ErrorMessage error={accept.error} />}
      </div>
    );
  }
  if (status === 'failed' && !ces && test.subject?.value === 'alta') {
    return (
      <div className="warning">
        <p>
          <strong>{t('Nu corectăm încă această materie.')}</strong> {translateMessage(message ?? '')}
        </p>
        <p>{t('Dacă materia e alta, schimb-o. Dacă ai încărcat alt test din greșeală, înlocuiește testul la Pregătire: lucrările se corectează apoi cu testul nou.')}</p>
        <span className="row-actions">
          <SubjectChange test={test} onChanged={onChanged} onRobot={onRobot} />
          <MoveOnLink className="button-quiet button-small" stage={'Pregătire'}>
            <ActionIcon name="upload" />
            {t('Înlocuiește testul')}
          </MoveOnLink>
        </span>
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div className="warning">
        <p>
          <strong>{ces ? t('Robotul nu a putut citi testul CES și baremul CES.') : t('Robotul nu a putut citi testul și baremul.')}</strong> {translateMessage(message ?? '')}
        </p>
        <button type="button" className="button-quiet button-small" disabled={retry.isPending} onClick={() => retry.mutate()}>
          <ActionIcon name="retry" />
          {t('Încearcă din nou')}
        </button>
        {retry.error && <ErrorMessage error={retry.error} />}
      </div>
    );
  }
  return null;
}

// In evaluation, a class barem being generated or waiting for its check holds
// every class paper back (the robot grades only with an active barem): the
// notice says so and leads to Pregătire, where the barem is checked.
export function BaremWaiting({ test }: { test: TestInfo }) {
  if (test.status !== 'evaluating' || test.files.test === null) return null;
  const generating = test.barem.request === 'requested';
  if (!generating && !(test.files.barem !== null && test.barem.unchecked)) return null;
  const failed = test.barem.request === 'failed';
  return (
    <div className="warning">
      <p>
        <strong>{t('Lucrările așteaptă baremul nou.')}</strong>{' '}
        {generating
          ? t('Se generează acum. După ce îl verifici la Pregătire, corectarea continuă.')
          : failed
            ? t('Nu s-a putut genera. La Pregătire îl generezi din nou sau încarci baremul tău.')
            : t('Verifică-l la Pregătire și confirmă-l. Apoi corectarea continuă.')}
      </p>
      <MoveOnLink className="button-quiet button-small" stage={'Pregătire'}>
        {t('Mergi la {stage}', { stage: t('Pregătire') })}
        <ActionIcon name="arrow" />
      </MoveOnLink>
    </div>
  );
}
