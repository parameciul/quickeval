import { useMutation } from '@tanstack/react-query';
import type { RobotStart, TestInfo, UploadRow } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { countLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { CesSwitch } from '../CesSwitch.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { MoveOnLink } from './MoveOnLink.tsx';
import { TestFiles } from './TestFiles.tsx';
import { cesBaremActive, showsCes } from './variant.ts';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { t } from '../../i18n/t.ts';

// "Varianta CES" in the panel Pregătire (spec: CES variant, CES switch): the
// adapted test that the CES students of the class get, with its own barem.
// The switch "Test separat pentru elevii cu CES" is on unless the teacher
// turned it off; off removes the CES files, and the CES students get the class
// test. Shown while the class has a CES student, or while the variant has a file.
export function CesVariant({
  test,
  uploads,
  onChanged,
  onRobot,
}: {
  test: TestInfo;
  uploads: UploadRow[];
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const api = useApi();
  const toggle = useMutation({
    mutationFn: (off: boolean) => api.setCesOff(test.code, off),
    onSuccess: async (answer) => {
      onRobot(answer.robot);
      await onChanged();
    },
  });
  if (!showsCes(test)) return null;
  const { ces } = test;
  const hasFiles = ces.files.test !== null || ces.files.barem !== null;
  const expected = ces.classTotalPoints ?? 100;
  const names = uploads.filter((row) => row.ces && row.active).map((row) => row.studentName);
  const onToggle = (on: boolean) => {
    if (!on && hasFiles && !window.confirm(t('Oprești testul separat? Fișierele CES se șterg, iar elevii cu CES primesc testul clasei.'))) return;
    toggle.mutate(!on);
  };

  return (
    <section className="ces-variant" aria-labelledby="ces-variant-title">
      <h3 id="ces-variant-title">{t('Varianta CES')}</h3>
      {ces.studentCount > 0 ? (
        <CesSwitch names={names} on={!ces.off} disabled={toggle.isPending || ces.papers > 0} onToggle={onToggle} />
      ) : (
        <p className="hint">{t('Nu mai e niciun elev cu CES în clasă.')}</p>
      )}
      {ces.papers > 0 && <p className="hint">{t('Varianta CES are lucrări trimise la corectare, așa că nu mai poate fi oprită. Poți înlocui fișierele ei.')}</p>}
      {toggle.error && <ErrorMessage error={toggle.error} />}
      {(!ces.off || hasFiles) && <TestFiles test={test} variant="ces" onChanged={onChanged} onRobot={onRobot} />}
      {ces.totalPoints !== null && ces.totalPoints !== expected && (
        <p className="warning">{t('Baremul CES are {formatPoints} puncte, iar baremul clasei {formatPoints2}. Baremul CES ar trebui să aibă tot atâtea puncte.', { formatPoints: formatPoints(ces.totalPoints), formatPoints2: formatPoints(expected) })}</p>
      )}
      {ces.studentCount === 0 && hasFiles && ces.papers === 0 && (
        <p>
          <button type="button" className="text-button is-danger" disabled={toggle.isPending} onClick={() => onToggle(false)}>
            {t('Șterge varianta CES')}
          </button>
        </p>
      )}
    </section>
  );
}

// In the panel Corectare: the CES papers wait while the CES barem is not active
// (missing, generating, or not checked yet). The class papers are graded
// meanwhile, and the class analysis waits for the CES papers.
// Why the CES barem is not active yet: none, being made, or not checked.
export function cesBaremWhy(test: TestInfo): string {
  const { ces } = test;
  if (ces.files.barem === null) return t('Încarcă sau generează baremul CES la Pregătire.');
  return ces.barem.request === 'requested' ? t('Baremul CES se generează.') : t('Verifică baremul CES generat la Pregătire.');
}

export function CesWaiting({ test }: { test: TestInfo }) {
  const { ces } = test;
  if (ces.waiting === 0 || ces.files.test === null || cesBaremActive(test)) return null;
  const why = cesBaremWhy(test);
  return (
    <div className="warning">
      <p>
        <strong>{t('{countLabel} baremul CES.', { countLabel: countLabel(ces.waiting, 'lucrare CES așteaptă', 'lucrări CES așteaptă') })}</strong> {why}{' '}{t('Celelalte lucrări se corectează între timp.')}
      </p>
      <MoveOnLink className="button-quiet button-small" stage={'Pregătire'}>
        {t('Mergi la varianta CES')}
        <ActionIcon name="arrow" />
      </MoveOnLink>
    </div>
  );
}
