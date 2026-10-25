import { useMutation } from '@tanstack/react-query';
import type { RobotStart, TestInfo, UploadRow } from '../../../shared/api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// The print PDF of an open test waits for the robot: the test has its file,
// and the PDF is neither made nor failed.
export function waitsForPrint(test: TestInfo): boolean {
  return test.status === 'open' && test.files.test !== null && test.print.status === 'none';
}

// Work waits for the robot: the print PDF of an open test waits, or the test
// is in evaluation, its exercise list does not wait for the teacher, and an
// upload waits or was left in grading, or every upload is graded and the
// class analysis waits.
export function waitsForRobot(test: TestInfo, uploads: UploadRow[]): boolean {
  if (waitsForPrint(test)) return true;
  if (test.status !== 'evaluating') return false;
  if (test.exerciseList.status === 'problem' || test.exerciseList.status === 'failed') return false;
  if (uploads.some((row) => row.status === 'submitted' || row.status === 'grading')) return true;
  return test.analysis.status === 'requested' && test.gradedCount > 0;
}

// "Pornește robotul": the teacher starts the robot again for work that a run
// left when it stopped early (a usage limit, a crash, the time limit), or for
// a print PDF when the robot did not start.
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
