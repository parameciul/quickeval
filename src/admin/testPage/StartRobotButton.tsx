import { useMutation } from '@tanstack/react-query';
import type { RobotStart, TestInfo, UploadRow } from '../../../shared/api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// Work waits for the robot: the test is in evaluation, its exercise list does
// not wait for the teacher, and an upload waits or was left in grading.
export function waitsForRobot(test: TestInfo, uploads: UploadRow[]): boolean {
  if (test.status !== 'evaluating') return false;
  if (test.exerciseList.status === 'problem' || test.exerciseList.status === 'failed') return false;
  return uploads.some((row) => row.status === 'submitted' || row.status === 'grading');
}

// "Pornește robotul": the teacher starts the robot again for work that a run
// left when it stopped early (a usage limit, a crash, the time limit).
export function StartRobotButton({
  code,
  onChanged,
  onRobot,
}: {
  code: string;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const api = useApi();
  const start = useMutation({
    mutationFn: () => api.startRobot(code),
    onSuccess: async (robot) => {
      onRobot(robot);
      await onChanged();
    },
  });
  return (
    <>
      <button type="button" className="button-quiet button-small" disabled={start.isPending} onClick={() => start.mutate()}>
        Pornește robotul
      </button>
      {start.error && <ErrorMessage error={start.error} />}
    </>
  );
}
