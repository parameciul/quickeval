import { useMutation } from '@tanstack/react-query';
import { useEffect, useId, useRef } from 'react';
import { useLocation } from 'react-router';
import type { RobotStart, TestDetail, TestInfo, UploadRow } from '../../../shared/api.ts';
import { unsupportedMessage } from '../../../shared/subjects.ts';
import type { TestStatus } from '../../../shared/tests.ts';
import { countLabel, formatDateTime } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { EmptyState } from '../EmptyState.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { IconQr } from '../shell/icons.tsx';
import type { StageName } from '../stages.ts';
import { AnalysisState } from './AnalysisState.tsx';
import { EvaluationControls } from './EvaluationControls.tsx';
import { missingOf } from '../missing.ts';
import { MissingList } from '../MissingList.tsx';
import { CesVariant, CesWaiting } from './CesVariant.tsx';
import { ExerciseListBanner } from './ExerciseListBanner.tsx';
import { SubjectChange } from './SubjectForm.tsx';
import { clearPrint } from './printPdf.ts';
import { PrintTest } from './PrintTest.tsx';
import { isMoveOn, MoveOnLink } from './MoveOnLink.tsx';
import { NowBox, UploadsBand } from './StageNow.tsx';
import { WaysIn } from './WaysIn.tsx';
import { ReportCard } from './ReportCard.tsx';
import { linksCount, ResultLinksTable } from './ResultLinksTable.tsx';
import { NoResultsYet, ResultsAccess } from './ResultsAccess.tsx';
import { ReviewOverview, showsOverview } from './ReviewOverview.tsx';
import { RobotLine } from './RobotLine.tsx';
import { StartRobotButton, waitsForBarem, waitsForPrint, waitsForRobot } from './StartRobotButton.tsx';
import { TestFiles } from './TestFiles.tsx';
import { PapersProgress } from './PapersProgress.tsx';
import { UploadsTable } from './UploadsTable.tsx';
import { ActionIcon } from '../../ui/ActionIcon.tsx';

export interface PanelProps {
  test: TestInfo;
  uploads: UploadRow[];
  robot: TestDetail['robot'];
  showModel: boolean;
  // The uploads to grade at the next start (submission ids), chosen in the
  // table of Corectare. Kept by the page, so another panel does not lose them.
  selected: number[];
  onSelect: (ids: number[]) => void;
  // After the evaluation started now: every upload is checked again next time.
  onSelectionReset: () => void;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}

// The landing page's sentence for each stage (redesign spec §3), but for
// Rezultate: there the teacher reads what each student gets once the results
// are published (spec 2026-11-14), not what the landing page promises.
const SENTENCES: Record<StageName, string> = {
  Pregătire: 'Încarci testul și baremul. Nu ai barem? Primești o propunere pe care o verifici tu.',
  Tipărire: 'Tipărești testul. Fiecare pagină are un cod QR.',
  'În clasă':
    'Elevii trimit pozele lucrării de pe telefon: scanează codul QR de pe foaia testului sau deschid linkul primit de la tine. Fără cont și fără aplicație.',
  Corectare: 'Fiecare lucrare primește punctaj după barem, pas cu pas, cu 10 puncte din oficiu.',
  Verificare: 'Punctele nesigure te așteaptă pe tine. Accepți sau schimbi punctajul.',
  Rezultate:
    'După ce rezultatele sunt publicate, fiecare elev are acces la rezultatul lui: nota finală, punctele pe fiecare exercițiu, explicații detaliate pentru fiecare problemă rezolvată corect sau greșit și o sinteză finală cu ce merge bine și recomandări.',
};

// The panel of one stage of the test page (redesign spec §6): its name, its
// sentence, and the controls of that stage.
export function StagePanel({ stage, ...props }: PanelProps & { stage: StageName }) {
  const id = useId();
  // A link to another stage (MoveOnLink: the bar at the foot of the page,
  // StageBar, or a link inside a panel) can be clicked far down a long page: after it, the page shows the top of the new panel, and its
  // heading takes the focus, so a screen reader names it. Chrome does not
  // always scroll to an element that takes the focus right after a click, so
  // the panel is scrolled into view first (jsdom has no scrollIntoView). A
  // click on the list of stages keeps the focus on its link. A reload keeps
  // the navigation state, so only a move made after the page opened counts.
  const panel = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const location = useLocation();
  const openedAt = useRef(location.key);
  useEffect(() => {
    if (location.key === openedAt.current || !isMoveOn(location.state)) return;
    panel.current?.scrollIntoView?.({ block: 'start' });
    heading.current?.focus({ preventScroll: true });
  }, [location.key, location.state]);
  return (
    <section className="stage-panel" aria-labelledby={id} ref={panel}>
      <div className="stage-head">
        <h2 id={id} ref={heading} tabIndex={-1}>
          {stage}
        </h2>
        <p>{SENTENCES[stage]}</p>
      </div>
      <div className="stage-body">
        {stage === 'Pregătire' && <PreparePanel {...props} />}
        {stage === 'Tipărire' && <PrintPanel {...props} />}
        {stage === 'În clasă' && <ClassPanel {...props} />}
        {stage === 'Corectare' && <GradingPanel {...props} />}
        {stage === 'Verificare' && <ReviewPanel {...props} />}
        {stage === 'Rezultate' && <ResultsPanel {...props} />}
      </div>
    </section>
  );
}

function PreparePanel({ test, uploads, robot, onChanged, onRobot }: PanelProps) {
  return (
    <>
      {test.subject?.value === 'alta' && (
        // Found with a generated barem, before the test is given (spec: any
        // subject). The students may still upload; the grading does not start.
        <div className="warning">
          <p>
            <strong>Nu corectăm încă această materie.</strong> {unsupportedMessage(test.subject.name)}
          </p>
          <p>Dacă materia e alta, schimb-o. Dacă ai ales alt test din greșeală, înlocuiește-l mai jos.</p>
          <SubjectChange test={test} onChanged={onChanged} onRobot={onRobot} />
        </div>
      )}
      <TestFiles test={test} onChanged={onChanged} onRobot={onRobot} />
      <CesVariant test={test} uploads={uploads} onChanged={onChanged} onRobot={onRobot} />
      {waitsForBarem(test) && (
        <RobotLine lastCheckAt={robot.lastCheckAt} lateText="Baremul poate întârzia.">
          <StartRobotButton code={test.code} onChanged={onChanged} onRobot={onRobot} />
        </RobotLine>
      )}
    </>
  );
}

function PrintPanel({ test, robot, onChanged, onRobot }: PanelProps) {
  // Leaving Tipărire removes the hidden frame of the last "Tipărește".
  useEffect(() => clearPrint, []);
  // After the test was given, the PDFs made before stay here to print again.
  if (test.status !== 'draft' && test.status !== 'open') {
    return (
      <>
        <p className="hint">Testul s-a dat în clasă.</p>
        {test.print.status === 'ready' && <PrintTest test={test} onChanged={onChanged} onRobot={onRobot} />}
        {test.ces.files.test !== null && test.ces.print.status === 'ready' && (
          <PrintTest test={test} variant="ces" onChanged={onChanged} onRobot={onRobot} />
        )}
      </>
    );
  }
  return (
    <>
      <PrintTest test={test} onChanged={onChanged} onRobot={onRobot} />
      {test.ces.files.test !== null && <PrintTest test={test} variant="ces" onChanged={onChanged} onRobot={onRobot} />}
      {waitsForPrint(test) && (
        <RobotLine lastCheckAt={robot.lastCheckAt} lateText="Testul cu cod QR poate întârzia.">
          <StartRobotButton code={test.code} onChanged={onChanged} onRobot={onRobot} />
        </RobotLine>
      )}
    </>
  );
}

// The numbers of the class: who sent, and who did not yet.
function sentTitle(test: TestInfo): string {
  return `${test.submittedCount} din ${countLabel(test.studentCount, 'elev', 'elevi')} ${test.submittedCount === 1 ? 'a trimis' : 'au trimis'} lucrarea`;
}

function notSent(test: TestInfo): string {
  const left = Math.max(0, test.studentCount - test.submittedCount);
  if (left === 0) return 'Au trimis toți elevii.';
  return `${countLabel(left, 'elev nu a', 'elevi nu au')} trimis încă.`;
}

// În clasă (design A): the "Acum" box says where the test is and what comes
// next, then how the students send their work, then the papers. While the
// test is open, the box's band opens and closes the uploads.
function ClassPanel(props: PanelProps) {
  const { test, uploads, onChanged } = props;
  // While the test is open and no student has started an upload, the papers
  // table would only say "Nu a trimis". A started upload with no file yet is a
  // row ("Încarcă…", with "Resetează").
  const nothingYet = test.status === 'open' && uploads.every((row) => row.submissionId === null);
  const closed = test.status === 'open' && test.uploadsClosedAt !== null;
  return (
    <>
      <ClassNow {...props} />
      {test.status === 'draft' || (test.status === 'open' && !closed) ? (
        <WaysIn test={test} onChanged={onChanged} />
      ) : (
        closed && (
          <>
            <h3>Cum trimit elevii lucrarea</h3>
            <p className="hint">Încărcarea e închisă: linkurile nu primesc lucrări până o redeschizi. Codul QR de pe foaie rămâne același.</p>
          </>
        )
      )}
      {test.status === 'open' && <StopTest {...props} />}
      {nothingYet ? (
        <EmptyState icon={<IconQr />} title="Nicio lucrare trimisă încă">
          {closed
            ? 'Încărcarea e închisă. Lucrările apar aici după ce o redeschizi și elevii trimit pozele.'
            : 'Elevii scanează codul QR de pe test și trimit pozele. Lucrările apar aici pe măsură ce vin.'}
        </EmptyState>
      ) : (
        test.status !== 'draft' && <Papers {...props} selectable={false} />
      )}
    </>
  );
}

function classNext() {
  return (
    <>
      Corectarea o pornești la etapa <MoveOnLink stage="Corectare">Corectare</MoveOnLink>, acum sau mai târziu.
    </>
  );
}

// What "Redeschide încărcarea" does, after the grading or during it.
const REOPEN_HINT = {
  done: 'Pentru elevii care nu au trimis. Notele date rămân.',
  grading:
    'Pentru elevii care nu au trimis. Notele date rămân; lucrările care nu sunt gata așteaptă din nou, până pornești corectarea pentru toate.',
} as const;

// The "Acum" box of În clasă, by the state of the test. The test is printed
// before the day of the test (its QR code is ready from the start) and started
// on that day: starting it opens the uploads and gives the test its date.
function ClassNow({ test, onChanged, onRobot }: PanelProps) {
  const api = useApi();
  const start = useMutation({
    mutationFn: () => api.startTest(test.code),
    onSuccess: async (started) => {
      onRobot(started.robot);
      await onChanged();
    },
  });
  const reopen = useMutation({
    mutationFn: () => api.reopenTest(test.code),
    onSuccess: async (reopened) => {
      onRobot(reopened.robot);
      await onChanged();
    },
  });

  if (test.status === 'draft') {
    return (
      <NowBox label="Acum" title="Testul nu a început" next="Elevii trimit pozele lucrării. Le vezi aici, pe măsură ce vin.">
        <p className="now-sub">Elevii nu pot trimite lucrări încă. Începe testul în ziua testului, când împarți foile: atunci primește data.</p>
        <div className="now-actions">
          <button type="button" className="button" disabled={start.isPending} onClick={() => start.mutate()}>
            <ActionIcon name="play" />
            Începe testul
          </button>
        </div>
        <MissingList missing={missingOf(test)} lead="Înainte să începi," after="Poți începe oricum." why />
        {start.error && <ErrorMessage error={start.error} />}
      </NowBox>
    );
  }
  if (test.status === 'open') {
    const since = test.startedAt ? `Testul a început pe ${formatDateTime(test.startedAt)}. ` : '';
    return (
      <NowBox band={<UploadsBand test={test} onChanged={onChanged} />} title={sentTitle(test)} next={classNext()}>
        <p className="now-sub">{test.uploadsClosedAt !== null ? 'Lucrările așteaptă să pornești corectarea.' : `${since}${notSent(test)}`}</p>
        <ScheduledStart test={test} onChanged={onChanged} />
      </NowBox>
    );
  }
  const closedAt = test.evaluationStartedAt ? ` pe ${formatDateTime(test.evaluationStartedAt)}` : '';
  return (
    <NowBox
      label={`Acum · încărcarea s-a închis${closedAt}`}
      title={sentTitle(test)}
      next={
        test.status === 'done' ? (
          <>
            Corectarea s-a terminat. Verifici punctele nesigure la etapa <MoveOnLink stage="Verificare">Verificare</MoveOnLink>.
          </>
        ) : (
          <>
            Se corectează lucrările la etapa <MoveOnLink stage="Corectare">Corectare</MoveOnLink>: {test.gradedCount} din {test.submittedCount} gata.
          </>
        )
      }
    >
      <p className="now-sub">Elevii nu mai pot trimite.</p>
      <div className="now-actions">
        <button type="button" className="button-quiet" disabled={reopen.isPending} onClick={() => reopen.mutate()}>
          <ActionIcon name="retry" />
          Redeschide încărcarea
        </button>
        <p className="hint">{REOPEN_HINT[test.status === 'done' ? 'done' : 'grading']}</p>
      </div>
      {reopen.error && <ErrorMessage error={reopen.error} />}
    </NowBox>
  );
}

// "Oprește testul": for a test started by mistake, while no student has
// uploaded a file and the test was never evaluated (the API checks it too).
function StopTest({ test, uploads, onChanged, onRobot }: PanelProps) {
  const api = useApi();
  const stop = useMutation({
    mutationFn: () => api.stopTest(test.code),
    onSuccess: async () => {
      onRobot(null);
      await onChanged();
    },
  });
  const canStop = test.evaluationStartedAt === null && uploads.every((row) => row.fileCount === 0);
  if (!canStop && !stop.error) return null;
  return (
    <>
      {canStop && (
        <p className="stop-row">
          <span className="hint">Ai început testul din greșeală?</span>
          <button
            type="button"
            className="button-quiet button-small"
            disabled={stop.isPending}
            onClick={() => {
              const schedule = test.evaluationAt ? ' Corectarea programată se anulează.' : '';
              const question = `Oprești testul? Elevii nu mai pot încărca lucrările până îl începi din nou, iar data testului se șterge.${schedule}`;
              if (window.confirm(question)) stop.mutate();
            }}
          >
            <ActionIcon name="stop" />
            Oprește testul
          </button>
        </p>
      )}
      {stop.error && <ErrorMessage error={stop.error} />}
    </>
  );
}

// A grading scheduled before the schedule left the page: it still starts by
// itself, so the page says when and lets the teacher cancel it.
function ScheduledStart({ test, onChanged }: { test: TestInfo; onChanged: () => Promise<void> }) {
  const api = useApi();
  const cancel = useMutation({ mutationFn: () => api.cancelSchedule(test.code), onSuccess: onChanged });
  if (!test.evaluationAt) return null;
  return (
    <>
      <p className="now-actions">
        <span>Corectarea pornește automat la {formatDateTime(test.evaluationAt)}.</span>
        <button type="button" className="button-quiet button-small" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
          <ActionIcon name="close" />
          Anulează programarea
        </button>
      </p>
      {cancel.error && <ErrorMessage error={cancel.error} />}
    </>
  );
}

function gradingNext() {
  return (
    <>
      Verifici punctele nesigure la etapa <MoveOnLink stage="Verificare">Verificare</MoveOnLink>.
    </>
  );
}

// Corectare (design A): the "Acum" box with the one action of the stage, by
// the state of the test, then the papers.
function GradingPanel(props: PanelProps) {
  const { test, uploads, robot, selected, onChanged, onRobot } = props;
  if (test.status === 'draft') {
    return <p className="hint">Corectarea începe după ce elevii trimit lucrările. Atunci alegi lucrările și pornești corectarea.</p>;
  }
  return (
    <>
      <ExerciseListBanner test={test} onChanged={onChanged} onRobot={onRobot} />
      <ExerciseListBanner test={test} variant="ces" onChanged={onChanged} onRobot={onRobot} />
      <CesWaiting test={test} />
      {test.status === 'open' ? (
        <NowBox band={<UploadsBand test={test} onChanged={onChanged} grading />} title={waitingTitle(test, uploads)} next={gradingNext()}>
          <StillSending uploads={uploads} />
          <EvaluationControls
            test={test}
            uploads={uploads}
            selected={selected}
            onChanged={onChanged}
            onStarted={props.onSelectionReset}
            onRobot={onRobot}
          />
          <ScheduledStart test={test} onChanged={onChanged} />
        </NowBox>
      ) : (
        <GradingNow {...props} />
      )}
      {test.status !== 'open' && <PartialEvaluationNotice status={test.status} uploads={uploads} />}
      {(test.status === 'evaluating' || test.evaluationAt) && (
        <RobotLine lastCheckAt={robot.lastCheckAt}>
          {test.status === 'evaluating' && waitsForRobot(test, uploads) && (
            <StartRobotButton code={test.code} onChanged={onChanged} onRobot={onRobot} />
          )}
        </RobotLine>
      )}
      <AnalysisState test={test} uploads={uploads} />
      <Papers {...props} selectable={test.status === 'open'} />
    </>
  );
}

// "N lucrări așteaptă corectarea": the sent papers not graded yet, the same
// number as the note of Corectare in the list of stages.
function waitingTitle(test: TestInfo, uploads: UploadRow[]): string {
  const waiting = Math.max(0, test.submittedCount - test.gradedCount);
  if (waiting === 0) {
    return uploads.some((row) => row.status === 'graded') ? 'Toate lucrările trimise sunt corectate' : 'Nicio lucrare trimisă nu așteaptă corectarea';
  }
  return `${countLabel(waiting, 'lucrare așteaptă', 'lucrări așteaptă')} corectarea`;
}

// The papers a student is still sending, with files: they can be graded too
// while they stay checked in the table.
function StillSending({ uploads }: { uploads: UploadRow[] }) {
  const sending = uploads.filter((row) => row.status === 'uploading' && row.fileCount > 0).length;
  if (sending === 0) return null;
  return (
    <p className="now-sub">
      {sending === 1 ? 'Încă 1 elev își încarcă lucrarea' : `Încă ${countLabel(sending, 'elev', 'elevi')} își încarcă lucrarea`}: o poți corecta și pe ea cât e bifată în
      tabel.
    </p>
  );
}

// The "Acum" box of a test whose uploads closed: grading goes on, or has ended.
function GradingNow({ test, uploads, onChanged, onRobot }: PanelProps) {
  const api = useApi();
  const reopen = useMutation({
    mutationFn: () => api.reopenTest(test.code),
    onSuccess: async (reopened) => {
      onRobot(reopened.robot);
      await onChanged();
    },
  });
  const since = test.evaluationStartedAt ? ` · corectarea a pornit pe ${formatDateTime(test.evaluationStartedAt)}` : '';
  if (test.status === 'done') {
    return (
      <NowBox label={`Acum${since}`} title="Corectarea s-a terminat" next={gradingNext()}>
        <p className="now-sub">{countLabel(test.gradedCount, 'lucrare corectată', 'lucrări corectate')}.</p>
      </NowBox>
    );
  }
  const sent = uploads.filter((row) => row.status === 'graded' || row.status === 'grading' || row.status === 'submitted' || row.status === 'failed').length;
  const left = Math.max(0, test.studentCount - test.submittedCount);
  return (
    <NowBox label={`Acum${since}`} title={`Se corectează: ${test.gradedCount} din ${countLabel(sent, 'lucrare', 'lucrări')} gata`} next={gradingNext()}>
      <span className="now-bar" aria-hidden="true">
        <span style={{ width: `${sent === 0 ? 0 : (test.gradedCount / sent) * 100}%` }} />
      </span>
      <p className="now-sub">Lucrările apar în tabel pe măsură ce sunt gata. Poți închide pagina.</p>
      <div className="now-actions">
        <span>
          <strong>Încărcarea e închisă.</strong> {left === 0 ? 'Au trimis toți elevii.' : `${countLabel(left, 'elev nu a', 'elevi nu au')} trimis.`}
        </span>
        <button type="button" className="button-quiet button-small" disabled={reopen.isPending} onClick={() => reopen.mutate()}>
          <ActionIcon name="retry" />
          Redeschide încărcarea
        </button>
        <p className="hint">{REOPEN_HINT.grading}</p>
      </div>
      {reopen.error && <ErrorMessage error={reopen.error} />}
    </NowBox>
  );
}

function ReviewPanel({ test, uploads }: PanelProps) {
  if (!showsOverview(test)) return <p className="hint">Punctele nesigure apar după ce se corectează lucrările.</p>;
  return <ReviewOverview test={test} uploads={uploads} />;
}

// The results (redesign spec §8, spec 2026-11-14): publishing at the top,
// then the students' links beside "Raportul clasei". The links table takes
// the place of the papers table here.
function ResultsPanel({ test, uploads, onChanged }: PanelProps) {
  if (test.status === 'draft') return <NoResultsYet />;
  const count = linksCount(uploads, test.resultsOpen);
  return (
    <>
      <ResultsAccess test={test} onChanged={onChanged} />
      <div className="results-layout">
        <div className="results-grid">
          <ReportCard test={test} uploads={uploads} />
          <div className="results-students">
            <div className="results-students-head">
              <h3>Elevii</h3>
              {count && <span className={count.all ? 'tag tag-ok' : 'tag'}>{count.text}</span>}
            </div>
            <ResultLinksTable code={test.code} uploads={uploads} resultsOpen={test.resultsOpen} onChanged={onChanged} />
          </div>
        </div>
      </div>
    </>
  );
}

// The papers of the class: who sent or took part, the grades, and what waits.
// Only the table of Corectare has checkboxes, while the test is open.
function Papers({ test, uploads, showModel, selected, onSelect, onChanged, onRobot, selectable }: PanelProps & { selectable: boolean }) {
  return (
    <>
      <PapersProgress test={test} uploads={uploads} />
      <UploadsTable
        code={test.code}
        uploads={uploads}
        showModel={showModel}
        uploadsClosed={test.status === 'evaluating' || test.status === 'done'}
        uploadsPaused={test.status === 'open' && test.uploadsClosedAt !== null}
        selectable={selectable}
        selected={selected}
        onSelect={onSelect}
        onChanged={onChanged}
        onRobot={onRobot}
      />
    </>
  );
}

// An evaluation with uploads that stayed out of it: the teacher selected others,
// or a demo account had no more papers left. During the evaluation, a sent
// upload still waits for its turn.
function PartialEvaluationNotice({ status, uploads }: { status: TestStatus; uploads: UploadRow[] }) {
  const pending = uploads.filter(
    (row) => row.fileCount > 0 && (row.status === 'uploading' || (status === 'done' && row.status === 'submitted')),
  );
  if (pending.length === 0) return null;
  const what = pending.length === 1 ? '1 lucrare cu fișiere nu a fost corectată' : `${pending.length} lucrări cu fișiere nu au fost corectate`;
  return (
    <div className="warning" role="status">
      <p>
        <strong>Evaluare parțială.</strong> {what}. Redeschide încărcarea și pornește evaluarea pentru ele.
      </p>
    </div>
  );
}
