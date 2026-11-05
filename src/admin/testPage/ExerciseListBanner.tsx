import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { stageHash } from '../stages.ts';

// The robot reads the test and the barem first and makes a list of the
// exercises (spec §9). Shown only when that list needs the teacher: its
// points do not add up, or the robot could not make it. It shows in the panel
// Corectare; the barem is replaced in the panel Pregătire.
export function ExerciseListBanner({
  test,
  onChanged,
  onRobot,
}: {
  test: TestInfo;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const api = useApi();
  const onStarted = async (robot: RobotStart | null) => {
    onRobot(robot);
    await onChanged();
  };
  const accept = useMutation({ mutationFn: () => api.acceptExerciseList(test.code), onSuccess: onStarted });
  const retry = useMutation({ mutationFn: () => api.retryExerciseList(test.code), onSuccess: onStarted });
  const { status, message } = test.exerciseList;

  if (status === 'problem') {
    return (
      <div className="warning">
        <p>
          <strong>Baremul are o problemă.</strong> {message}
        </p>
        <p>Înlocuiește baremul la Pregătire, sau corectează cu baremul așa cum este.</p>
        <span className="row-actions">
          <button type="button" className="button-quiet button-small" disabled={accept.isPending} onClick={() => accept.mutate()}>
            Folosește oricum
          </button>
          <Link className="button-quiet button-small" to={{ hash: stageHash('Pregătire') }} replace>
            Înlocuiește baremul
          </Link>
        </span>
        {accept.error && <ErrorMessage error={accept.error} />}
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div className="warning">
        <p>
          <strong>Robotul nu a putut citi testul și baremul.</strong> {message}
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
