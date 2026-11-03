import { useMutation } from '@tanstack/react-query';
import type { RobotStart, TestInfo, UploadRow } from '../../../shared/api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// The print PDF of a draft or open test waits for the robot: the test has its
// link and its file, and the PDF is neither made nor failed.
export function waitsForPrint(test: TestInfo): boolean {
  return (
    (test.status === 'draft' || test.status === 'open') && test.uploadToken !== null && test.files.test !== null && test.print.status === 'none'
  );
}

// The barem the teacher asked for waits for the robot: the test is a draft or
// open, has its test file, and the request is neither answered nor failed.
export function waitsForBarem(test: TestInfo): boolean {
  return (test.status === 'draft' || test.status === 'open') && test.files.test !== null && test.barem.request === 'requested';
}

// Work waits for the robot: the print PDF or a requested barem waits, or the
// test is in evaluation, its exercise list does not wait for the teacher, and an
// upload waits or was left in grading, or every upload is graded and the
// class analysis waits.
export function waitsForRobot(test: TestInfo, uploads: UploadRow[]): boolean {
  if (waitsForPrint(test) || waitsForBarem(test)) return true;
  if (test.status !== 'evaluating') return false;
  if (test.exerciseList.status === 'problem' || test.exerciseList.status === 'failed') return false;
  if (uploads.some((row) => row.status === 'submitted' || row.status === 'grading')) return true;
  return test.analysis.status === 'requested' && test.gradedCount > 0;
}

// "Pornește robotul": the teacher starts the robot again for work that a run
// left when it stopped early (a usage limit, a crash, the time limit), or for
// a print PDF or a generated barem when the robot did not start.
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
