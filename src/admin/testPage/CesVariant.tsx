import { useMutation } from '@tanstack/react-query';
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { countLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { MoveOnLink } from './MoveOnLink.tsx';
import { TestFiles } from './TestFiles.tsx';
import { cesBaremActive, showsCes } from './variant.ts';

// "Varianta CES" in the panel Pregătire (spec: CES variant): the adapted test
// that the CES students of the class get, with its own barem. Optional: without
// it, they get the class test. Shown while the class has a CES student, or
// while the variant has a file.
export function CesVariant({
  test,
  onChanged,
  onRobot,
}: {
  test: TestInfo;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const api = useApi();
  const remove = useMutation({ mutationFn: () => api.removeCesVariant(test.code), onSuccess: onChanged });
  if (!showsCes(test)) return null;
  const { ces } = test;
  const hasFiles = ces.files.test !== null || ces.files.barem !== null;
  const expected = ces.classTotalPoints ?? 100;
  const askRemove = () => {
    if (window.confirm('Ștergi varianta CES? Elevii cu CES primesc atunci testul clasei.')) remove.mutate();
  };

  return (
    <section className="ces-variant" aria-labelledby="ces-variant-title">
      <h3 id="ces-variant-title">Varianta CES</h3>
      <p className="hint">
        {ces.studentCount > 0
          ? `${countLabel(ces.studentCount, 'elev cu CES primește', 'elevi cu CES primesc')} acest test, corectat cu baremul lui.`
          : 'Nu mai e niciun elev cu CES în clasă.'}{' '}
        Varianta e opțională: fără ea, elevii cu CES primesc testul clasei.
      </p>
      <TestFiles test={test} variant="ces" onChanged={onChanged} onRobot={onRobot} />
      {ces.totalPoints !== null && ces.totalPoints !== expected && (
        <p className="warning">
          Baremul CES are {formatPoints(ces.totalPoints)} puncte, iar baremul clasei {formatPoints(expected)}. Baremul CES ar trebui să aibă tot atâtea
          puncte.
        </p>
      )}
      {hasFiles &&
        (ces.papers > 0 ? (
          <p className="hint">Varianta CES are lucrări trimise la corectare, așa că nu mai poate fi ștearsă. Poți înlocui fișierele ei.</p>
        ) : (
          <p>
            <button type="button" className="text-button is-danger" disabled={remove.isPending} onClick={askRemove}>
              Șterge varianta CES
            </button>
          </p>
        ))}
      {remove.error && <ErrorMessage error={remove.error} />}
    </section>
  );
}

// In the panel Corectare: the CES papers wait while the CES barem is not active
// (missing, generating, or not checked yet). The class papers are graded
// meanwhile, and the class analysis waits for the CES papers.
export function CesWaiting({ test }: { test: TestInfo }) {
  const { ces } = test;
  if (ces.waiting === 0 || ces.files.test === null || cesBaremActive(test)) return null;
  const why =
    ces.files.barem === null
      ? 'Încarcă sau generează baremul CES la Pregătire.'
      : ces.barem.request === 'requested'
        ? 'Baremul CES se generează.'
        : 'Verifică baremul CES generat la Pregătire.';
  return (
    <div className="warning">
      <p>
        <strong>{countLabel(ces.waiting, 'lucrare CES așteaptă', 'lucrări CES așteaptă')} baremul CES.</strong> {why} Celelalte lucrări se corectează
        între timp.
      </p>
      <MoveOnLink className="button-quiet button-small" stage="Pregătire">
        Mergi la varianta CES
      </MoveOnLink>
    </div>
  );
}
