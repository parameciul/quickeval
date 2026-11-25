import { useMutation } from '@tanstack/react-query';
import type { RobotStart, TestInfo, UploadRow } from '../../../shared/api.ts';
import { cesBaremActive } from './variant.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { t } from '../../i18n/t.ts';

// The print PDF of a draft or open test waits for the robot: the test has its
// link and its file, and the PDF is neither made nor failed.
export function waitsForPrint(test: TestInfo): boolean {
  const open = (test.status === 'draft' || test.status === 'open') && test.uploadToken !== null;
  return open && ((test.files.test !== null && test.print.status === 'none') || (test.ces.files.test !== null && test.ces.print.status === 'none'));
}

// The barem the teacher asked for waits for the robot: the test has its test
// file, and the request is neither answered nor failed. A barem can be asked
// for in any status (whenever its file can be replaced), the CES one too.
export function waitsForBarem(test: TestInfo): boolean {
  const classBarem = test.files.test !== null && test.barem.request === 'requested';
  const cesBarem = test.ces.files.test !== null && test.ces.barem.request === 'requested';
  return classBarem || cesBarem;
}

// The class barem is settled: not being generated, and not generated and
// waiting for the teacher's check. Until then the robot grades no class paper
// (CLASS_BAREM_SETTLED on the server).
export function classBaremSettled(test: TestInfo): boolean {
  return !test.barem.unchecked && test.barem.request !== 'requested';
}

// Work waits for the robot: the print PDF or a requested barem waits, or the
// test is in evaluation, its exercise list does not wait for the teacher, and an
// upload waits or was left in grading, or every upload is graded and the
// class analysis waits.
export function waitsForRobot(test: TestInfo, uploads: UploadRow[]): boolean {
  if (waitsForPrint(test) || waitsForBarem(test)) return true;
  if (test.status !== 'evaluating') return false;
  if (test.exerciseList.status === 'problem' || test.exerciseList.status === 'failed') return false;
  // The CES papers that wait for an active CES barem, or for the teacher to
  // settle their exercise list, are no work for the robot; nor are the class
  // papers while the class barem is not settled.
  const cesList = test.ces.exerciseList.status;
  const active = uploads.filter((row) => row.status === 'submitted' || row.status === 'grading').length;
  const cesHeld = cesBaremActive(test) && cesList !== 'problem' && cesList !== 'failed' ? 0 : test.ces.waiting;
  const classHeld = classBaremSettled(test) ? 0 : Math.max(0, active - test.ces.waiting);
  if (active > cesHeld + classHeld) return true;
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
        <ActionIcon name="play" />
        {t('Pornește robotul')}
      </button>
      {start.error && <ErrorMessage error={start.error} />}
    </>
  );
}
