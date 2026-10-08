import { useMutation } from '@tanstack/react-query';
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// The robot reads the test and the barem first and makes a list of the
// exercises (spec §9). Shown only when that list needs the teacher: its
// points do not add up, or the robot could not make it.
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
  const accept = useMutation({ mutationFn: () => api.acceptExerciseList(test.code), onSuccess: onChanged });
  const retry = useMutation({
    mutationFn: () => api.retryExerciseList(test.code),
    onSuccess: async (robot) => {
      onRobot(robot);
      await onChanged();
    },
  });
  const { status, message } = test.exerciseList;

  if (status === 'problem') {
    return (
      <div className="warning">
        <p>
          <strong>Baremul are o problemă.</strong> {message}
        </p>
        <p>Înlocuiește baremul mai sus, sau corectează cu baremul așa cum este.</p>
        <button type="button" className="button-quiet button-small" disabled={accept.isPending} onClick={() => accept.mutate()}>
          Folosește oricum
        </button>
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
