import { useMutation } from '@tanstack/react-query';
import type { RobotStart, TestInfo, UploadRow } from '../../../shared/api.ts';
import { countLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { ActionIcon } from '../../ui/ActionIcon.tsx';

// The files the evaluation needs, as steps for the teacher.
function missingFiles(test: TestInfo): string[] {
  const missing: string[] = [];
  if (!test.files.test) missing.push('Încarcă testul.');
  if (!test.files.barem && test.barem.request !== 'requested') missing.push('Încarcă baremul.');
  if (test.barem.request === 'requested') missing.push('Baremul se generează încă.');
  else if (test.barem.unchecked) {
    missing.push(
      test.barem.request === 'failed'
        ? 'Baremul nu s-a putut genera: încearcă din nou sau încarcă un barem.'
        : 'Verifică baremul generat înainte de evaluare.',
    );
  }
  return missing;
}

// Start the grading of an open test (design A, the "Acum" box of Corectare):
// now, for the uploads selected in the table. While the students may still
// upload, the one button closes the uploads and starts the grading; once the
// teacher closed them ("Închide încărcarea"), it only starts the grading.
// Either way the uploads may be opened again later ("Redeschide încărcarea").
export function EvaluationControls({
  test,
  uploads,
  selected,
  onChanged,
  onStarted,
  onRobot,
}: {
  test: TestInfo;
  uploads: UploadRow[];
  // The selected uploads to grade now (submission ids): all of them unless
  // the teacher unchecked some. Empty: the start button stays off.
  selected: number[];
  onChanged: () => Promise<void>;
  // After the evaluation started now: the page forgets the unchecked uploads.
  onStarted: () => void;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const api = useApi();
  const start = useMutation({
    mutationFn: () => api.evaluateTest(test.code, undefined, selected),
    onSuccess: async (answer) => {
      onRobot(answer.robot);
      onStarted();
      await onChanged();
    },
  });
  const finish = useMutation({ mutationFn: () => api.finishTest(test.code), onSuccess: onChanged });

  // A test reopened after its grading: every sent paper is graded already, so
  // there is nothing to select and nothing for the robot.
  const allGraded =
    uploads.some((row) => row.status === 'graded') &&
    !uploads.some((row) => row.fileCount > 0 && (row.status === 'uploading' || row.status === 'submitted' || row.status === 'grading'));

  const fileSteps = missingFiles(test);
  const hasUploads = uploads.some((row) => row.fileCount > 0);
  const startSteps = hasUploads ? fileSteps : [...fileSteps, 'Niciun elev nu a încărcat încă fișiere.'];
  const needsSelection = startSteps.length === 0 && selected.length === 0;
  const closed = test.uploadsClosedAt !== null;
  const papers = countLabel(selected.length, 'lucrare', 'lucrări');

  if (allGraded) {
    return (
      <>
        <p className="now-sub">După ce marchezi testul ca terminat, elevii nu mai pot încărca.</p>
        <div className="now-actions">
          <button
            type="button"
            className="button"
            disabled={finish.isPending}
            onClick={() => {
              if (window.confirm('Marchezi testul ca terminat? Elevii nu mai pot încărca lucrări, iar notele rămân cum sunt.')) finish.mutate();
            }}
          >
            <ActionIcon name="check" />
            Marchează ca terminat
          </button>
        </div>
        {finish.error && <ErrorMessage error={finish.error} />}
      </>
    );
  }

  const label = closed ? 'Pornește corectarea' : 'Închide încărcarea și pornește corectarea';
  const confirmText = closed
    ? `Pornești corectarea pentru ${papers}? Lucrările neselectate cu fișiere așteaptă o corectare ulterioară.`
    : `Închizi încărcarea și pornești corectarea pentru ${papers}? Elevii nu mai pot trimite; poți redeschide încărcarea oricând. Lucrările neselectate cu fișiere așteaptă o corectare ulterioară.`;
  return (
    <>
      <div className="now-actions">
        <button
          type="button"
          className="button"
          disabled={startSteps.length > 0 || needsSelection || start.isPending}
          onClick={() => {
            if (window.confirm(confirmText)) start.mutate();
          }}
        >
          <ActionIcon name="play" />
          {label}
        </button>
        <p className="hint">
          {needsSelection
            ? 'Bifează în tabel cel puțin o lucrare cu fișiere.'
            : startSteps.length > 0
              ? `Ca să pornești corectarea: ${startSteps.join(' ')}`
              : `Se corectează ${selected.length === 1 ? '1 lucrare, bifată' : `${papers}, bifate`} în tabel.${closed ? '' : ' Poți redeschide încărcarea oricând, pentru elevii care nu au trimis.'}`}
        </p>
      </div>
      {start.error && <ErrorMessage error={start.error} />}
    </>
  );
}
