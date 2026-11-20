import { useMutation } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { RobotStart, UploadRow } from '../../../shared/api.ts';
import type { TestStatus } from '../../../shared/tests.ts';
import { countLabel } from '../../ui/format.ts';
import type { MenuAction } from '../ActionsMenu.tsx';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { t } from '../../i18n/t.ts';

// "Recorectează tot" (spec §8.5), an item of the test's "Acțiuni" menu: the
// robot grades again every graded upload and every upload whose grading
// failed, for example after a new barem. The teacher's corrections go, so it
// asks first. `action` is null while no upload can be graded again; `notes`
// say what happened, under the menu.
export function useRegradeAll({
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
}): { action: MenuAction | null; notes: ReactNode } {
  const api = useApi();
  // An open test grades the uploads after its grading starts: the page says
  // so until then, and not again if the test opens again.
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
  const what = countLabel(count, 'lucrare', 'lucrări');
  const action: MenuAction | null =
    count > 0
      ? {
          label: t('Recorectează tot'),
          hint: t('Robotul corectează din nou {what}. Punctajele schimbate de tine se pierd.', { what }),
          icon: 'retry',
          busy: regrade.isPending,
          onChoose: () => {
            if (window.confirm(t('Recorectezi {what}? Punctajele și comentariile schimbate de tine se pierd.', { what }))) regrade.mutate();
          },
        }
      : null;
  const notes = (
    <>
      {waits && <p role="status">{t('Lucrările se corectează din nou după ce pornești corectarea.')}</p>}
      {partly && (
        <p role="status">{t('Limita contului demo: se corectează din nou {sent} din cele {asked} lucrări. Celelalte își păstrează rezultatele.', { sent: partly.sent, asked: partly.asked })}</p>
      )}
      {regrade.error && <ErrorMessage error={regrade.error} />}
    </>
  );
  return { action, notes };
}
