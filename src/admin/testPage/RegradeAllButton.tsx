import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import type { RobotStart, UploadRow } from '../../../shared/api.ts';
import type { TestStatus } from '../../../shared/tests.ts';
import { countLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// "Recorectează tot" (spec §8.5): the robot grades again every graded upload
// and every upload whose grading failed, for example after a new barem. The
// teacher's corrections go, so the button asks first.
export function RegradeAllButton({
  code,
  testStatus,
  uploads,
  onChanged,
  onRobot,
}: {
  code: string;
  testStatus: TestStatus;
  uploads: UploadRow[];
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const api = useApi();
  // An open test grades the uploads after Start evaluation: the page says so
  // until the evaluation starts, and not again if the test opens again.
  const [regradedOpen, setRegradedOpen] = useState(false);
  // A demo account regrades only the papers it has left.
  const [partly, setPartly] = useState<{ sent: number; asked: number } | null>(null);
  if (regradedOpen && testStatus !== 'open') setRegradedOpen(false);
  const count = uploads.filter((row) => row.status === 'graded' || row.status === 'failed').length;
  const regrade = useMutation({
    mutationFn: () => api.regradeTest(code),
    onSuccess: async (answer) => {
      onRobot(answer.robot);
      setRegradedOpen(answer.robot === null);
      setPartly(answer.count < count ? { sent: answer.count, asked: count } : null);
      await onChanged();
    },
  });
  const waits = regradedOpen && testStatus === 'open';
  if (count === 0 && !waits && !partly) return null;

  return (
    <>
      {count > 0 && (
        <p>
          <button
            type="button"
            className="button-quiet"
            disabled={regrade.isPending}
            onClick={() => {
              const what = countLabel(count, 'lucrare', 'lucrări');
              if (window.confirm(`Recorectezi ${what}? Punctajele și comentariile schimbate de tine se pierd.`)) regrade.mutate();
            }}
          >
            Recorectează tot
          </button>
        </p>
      )}
      {waits && <p role="status">Lucrările se corectează din nou după ce pornești evaluarea.</p>}
      {partly && (
        <p role="status">
          Limita contului demo: se corectează din nou {partly.sent} din cele {partly.asked} lucrări. Celelalte își păstrează rezultatele.
        </p>
      )}
      {regrade.error && <ErrorMessage error={regrade.error} />}
    </>
  );
}
