import { useMutation } from '@tanstack/react-query';
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import type { TestVariant } from '../../../shared/files.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { MoveOnLink } from './MoveOnLink.tsx';
import { partsOf } from './variant.ts';

// The robot reads the test and the barem first and makes a list of the
// exercises (spec §9). Shown only when that list needs the teacher: its
// points do not add up, or the robot could not make it. It shows in the panel
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
          <strong>{ces ? 'Baremul CES are o problemă.' : 'Baremul are o problemă.'}</strong> {message}
        </p>
        <p>{ces ? 'Înlocuiește baremul CES la Pregătire, sau corectează cu el așa cum este.' : 'Înlocuiește baremul la Pregătire, sau corectează cu baremul așa cum este.'}</p>
        <span className="row-actions">
          <button type="button" className="button-quiet button-small" disabled={accept.isPending} onClick={() => accept.mutate()}>
            Folosește oricum
          </button>
          <MoveOnLink className="button-quiet button-small" stage="Pregătire">
            {ces ? 'Înlocuiește baremul CES' : 'Înlocuiește baremul'}
          </MoveOnLink>
        </span>
        {accept.error && <ErrorMessage error={accept.error} />}
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div className="warning">
        <p>
          <strong>{ces ? 'Robotul nu a putut citi testul CES și baremul CES.' : 'Robotul nu a putut citi testul și baremul.'}</strong> {message}
        </p>
        <button type="button" className="button-quiet button-small" disabled={retry.isPending} onClick={() => retry.mutate()}>
          Încearcă din nou
        </button>
        {retry.error && <ErrorMessage error={retry.error} />}
      </div>
    );
  }
  return null;
}
