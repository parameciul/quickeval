import { useMutation } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import type { RobotStart, TestDetail, TestInfo, UploadRow } from '../../../shared/api.ts';
import type { TestStatus } from '../../../shared/tests.ts';
import { formatDateTime } from '../../ui/format.ts';
import { GradingProgress } from '../../ui/GradingProgress.tsx';
import { useApi } from '../ApiContext.tsx';
import { EmptyState } from '../EmptyState.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { IconQr } from '../shell/icons.tsx';
import type { StageName } from '../stages.ts';
import { AnalysisState } from './AnalysisState.tsx';
import { EvaluationControls } from './EvaluationControls.tsx';
import { ExerciseListBanner } from './ExerciseListBanner.tsx';
import { PrintTest } from './PrintTest.tsx';
import { RegradeAllButton } from './RegradeAllButton.tsx';
import { isMoveOn, MoveOnLink } from './MoveOnLink.tsx';
import { ResultFiles } from './ResultFiles.tsx';
import { linksCount, ResultLinksTable } from './ResultLinksTable.tsx';
import { NoResultsYet, ResultsAccess } from './ResultsAccess.tsx';
import { ReviewList } from './ReviewList.tsx';
import { RobotLine } from './RobotLine.tsx';
import { StartRobotButton, waitsForBarem, waitsForPrint, waitsForRobot } from './StartRobotButton.tsx';
import { TestFiles } from './TestFiles.tsx';
import { MultiUploadLink, QrOverlay, uploadLink } from './UploadLink.tsx';
import { UploadsTable } from './UploadsTable.tsx';

export interface PanelProps {
  test: TestInfo;
  uploads: UploadRow[];
  robot: TestDetail['robot'];
  showModel: boolean;
  // The uploads to grade at the next start (submission ids), chosen in the
  // table of Corectare. Kept by the page, so another panel does not lose them.
  selected: number[];
  onSelect: (ids: number[]) => void;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}

// The landing page's sentence for each stage (redesign spec §3).
const SENTENCES: Record<StageName, string> = {
  Pregătire: 'Încarci testul și baremul. Nu ai barem? Primești o propunere pe care o verifici tu.',
  Tipărire: 'Tipărești testul. Fiecare pagină are un cod QR.',
  'În clasă': 'Elevii scanează codul și trimit pozele lucrării. Fără cont și fără aplicație.',
  Corectare: 'Fiecare lucrare primește punctaj conform baremului, pas cu pas, cu 10 puncte din oficiu.',
  Verificare: 'Punctele nesigure te așteaptă pe tine. Accepți sau schimbi punctajul.',
  Rezultate: 'Fiecare elev primește un link cu rezultatul lui. Raportul clasei, un PDF pentru fiecare elev și CSV pentru catalog.',
};

const NEXT: Partial<Record<StageName, StageName>> = {
  Pregătire: 'Tipărire',
  Tipărire: 'În clasă',
  'În clasă': 'Corectare',
  Corectare: 'Verificare',
  Verificare: 'Rezultate',
};

// The panel of one stage of the test page (redesign spec §6): its name, its
// sentence, and the controls of that stage.
export function StagePanel({ stage, ...props }: PanelProps & { stage: StageName }) {
  const id = useId();
  const next = NEXT[stage];
  // A link inside a panel to another stage (MoveOnLink) can sit at the end of
  // a long panel: after it, the page shows the top of the new panel, and its
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
        {next && (
          <p className="next-stage">
            <MoveOnLink stage={next}>Următoarea etapă: {next} →</MoveOnLink>
          </p>
        )}
      </div>
    </section>
  );
}

function PreparePanel({ test, robot, onChanged, onRobot }: PanelProps) {
  return (
    <>
      <TestFiles test={test} onChanged={onChanged} onRobot={onRobot} />
      {waitsForBarem(test) && (
        <RobotLine lastCheckAt={robot.lastCheckAt} lateText="Baremul poate întârzia.">
          <StartRobotButton code={test.code} onChanged={onChanged} onRobot={onRobot} />
        </RobotLine>
      )}
    </>
  );
}

function PrintPanel({ test, robot, onChanged, onRobot }: PanelProps) {
  if (test.status !== 'draft' && test.status !== 'open') {
    const kept = test.print.status === 'ready' ? ' Testul cu cod QR rămâne în Fișa testului.' : '';
    return <p className="hint">Testul s-a dat în clasă.{kept}</p>;
  }
  return (
    <>
      <PrintTest test={test} onChanged={onChanged} onRobot={onRobot} />
      {waitsForPrint(test) && (
        <RobotLine lastCheckAt={robot.lastCheckAt} lateText="Testul cu cod QR poate întârzia.">
          <StartRobotButton code={test.code} onChanged={onChanged} onRobot={onRobot} />
        </RobotLine>
      )}
    </>
  );
}

function ClassPanel(props: PanelProps) {
  const { test, uploads, onChanged } = props;
  // While the test is open and no student has started an upload, the papers
  // table would only say "Nu a trimis". A started upload with no file yet is a
  // row ("Încarcă…", with "Resetează").
  const nothingYet = test.status === 'open' && uploads.every((row) => row.submissionId === null);
  // The QR code on the whole screen belongs to the panel: it stays open when
  // the first paper turns the empty state into the table. Closing it gives the
  // focus back to its button, or to the panel's heading once the button is gone.
  const [fullScreen, setFullScreen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const token = test.uploadToken;
  return (
    <>
      <TestActions {...props} />
      {test.status === 'open' && <MultiUploadLink code={test.code} token={test.multiUploadToken} onChanged={onChanged} />}
      {nothingYet ? (
        <EmptyState
          icon={<IconQr />}
          title="Nicio lucrare trimisă încă"
          action={
            token ? (
              <button ref={button} type="button" className="button-quiet button-small" onClick={() => setFullScreen(true)}>
                Arată codul QR pe tot ecranul
              </button>
            ) : undefined
          }
        >
          Elevii scanează codul QR de pe test și trimit pozele. Lucrările apar aici pe măsură ce vin.
        </EmptyState>
      ) : (
        test.status !== 'draft' && <Papers {...props} selectable={false} />
      )}
      {fullScreen && token && (
        <QrOverlay
          url={uploadLink(token)}
          onClose={() => {
            setFullScreen(false);
            (button.current ?? document.querySelector<HTMLElement>('.stage-head h2'))?.focus();
          }}
        />
      )}
    </>
  );
}

function GradingPanel(props: PanelProps) {
  const { test, uploads, robot, selected, onChanged, onRobot } = props;
  if (test.status === 'draft') {
    return <p className="hint">Corectarea începe după ce elevii trimit lucrările. Atunci alegi lucrările și pornești corectarea, acum sau la o oră aleasă.</p>;
  }
  return (
    <>
      <ExerciseListBanner test={test} onChanged={onChanged} onRobot={onRobot} />
      {test.status === 'open' ? (
        <EvaluationControls
          test={test}
          uploads={uploads}
          selected={selected}
          onChanged={onChanged}
          onStarted={() => props.onSelect([])}
          onRobot={onRobot}
        />
      ) : (
        <EvaluationState test={test} />
      )}
      {test.status !== 'open' && <PartialEvaluationNotice status={test.status} uploads={uploads} />}
      {(test.status === 'evaluating' || test.evaluationAt) && (
        <RobotLine lastCheckAt={robot.lastCheckAt}>
          {test.status === 'evaluating' && waitsForRobot(test, uploads) && (
            <StartRobotButton code={test.code} onChanged={onChanged} onRobot={onRobot} />
          )}
        </RobotLine>
      )}
      <RegradeAllButton code={test.code} testStatus={test.status} uploads={uploads} onChanged={onChanged} onRobot={onRobot} />
      <AnalysisState test={test} uploads={uploads} />
      <Papers {...props} selectable={test.status === 'open'} />
    </>
  );
}

function ReviewPanel(props: PanelProps) {
  const { test, uploads } = props;
  if (test.status === 'draft') return <p className="hint">Punctele nesigure apar după ce se corectează lucrările.</p>;
  return (
    <>
      {test.gradedCount === 0 ? (
        <p className="hint">Punctele nesigure apar după ce se corectează lucrările.</p>
      ) : (
        <ReviewList test={test} uploads={uploads} />
      )}
      <Papers {...props} selectable={false} />
    </>
  );
}

// The results (redesign spec §8): publishing, the students' links, and
// "Pentru tine". The links table takes the place of the papers table here.
function ResultsPanel({ test, uploads, onChanged }: PanelProps) {
  if (test.status === 'draft') return <NoResultsYet />;
  const count = linksCount(uploads, test.resultsOpen);
  return (
    <>
      <p>Linkul arată nota, punctajul pe fiecare exercițiu și comentariile. Elevul îl vede după ce îl publici.</p>
      <ResultsAccess test={test} onChanged={onChanged} />
      <h3>Linkurile elevilor</h3>
      {count && <p className="hint">{count}</p>}
      <ResultLinksTable code={test.code} uploads={uploads} resultsOpen={test.resultsOpen} onChanged={onChanged} />
      <h3>Pentru tine</h3>
      <ResultFiles test={test} />
    </>
  );
}

// The papers of the class: who sent, the grades, and what waits. Only the
// table of Corectare has checkboxes, while the test is open.
function Papers({ test, uploads, showModel, selected, onSelect, onChanged, onRobot, selectable }: PanelProps & { selectable: boolean }) {
  return (
    <>
      <h3>
        Încărcări · trimise {test.submittedCount} din {test.studentCount}
        {test.gradedCount > 0 && ` · corectate ${test.gradedCount}`}
        {test.flagCount > 0 && ` · de verificat ${test.flagCount}`}
      </h3>
      <GradingProgress studentCount={test.studentCount} submittedCount={test.submittedCount} gradedCount={test.gradedCount} />
      <UploadsTable
        code={test.code}
        uploads={uploads}
        showModel={showModel}
        selectable={selectable}
        selected={selected}
        onSelect={onSelect}
        onChanged={onChanged}
        onRobot={onRobot}
      />
    </>
  );
}

// What the teacher can do in class, by the state of the test. The test is
// printed before the day of the test (its QR code is ready from the start) and
// started on that day: starting it opens the uploads and gives the test its
// date. A test started by mistake can be stopped while no student has uploaded
// a file.
function TestActions({ test, uploads, onChanged, onRobot }: PanelProps) {
  const api = useApi();
  const start = useMutation({
    mutationFn: () => api.startTest(test.code),
    onSuccess: async (started) => {
      onRobot(started.robot);
      await onChanged();
    },
  });
  const stop = useMutation({
    mutationFn: () => api.stopTest(test.code),
    onSuccess: async () => {
      onRobot(null);
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
      <>
        <p className="hint">
          Elevii pot încărca lucrările după ce începi testul. Începe-l în ziua testului, când le dai foile: data testului este ziua
          în care îl începi.
        </p>
        <p>
          <button type="button" className="button" disabled={start.isPending} onClick={() => start.mutate()}>
            Începe testul
          </button>
        </p>
        {start.error && <ErrorMessage error={start.error} />}
      </>
    );
  }
  // Stopping is refused once a student has uploaded a file, or once the test
  // was evaluated (a reopened test): the API checks it too.
  const canStop = test.evaluationStartedAt === null && uploads.every((row) => row.fileCount === 0);
  if (test.status === 'open')
    return (
      <>
        <p className="hint">Elevii trimit lucrările. Corectarea pornește la etapa Corectare, acum sau la o oră aleasă.</p>
        {canStop && (
          <>
            <p className="hint">Ai început testul din greșeală? Îl poți opri cât timp niciun elev nu a încărcat lucrarea.</p>
            <p>
              <button
                type="button"
                className="button-quiet button-small"
                disabled={stop.isPending}
                onClick={() => {
                  const schedule = test.evaluationAt ? ' Evaluarea programată se anulează.' : '';
                  const question = `Oprești testul? Elevii nu mai pot încărca lucrările până îl începi din nou, iar data testului se șterge.${schedule}`;
                  if (window.confirm(question)) stop.mutate();
                }}
              >
                Oprește testul
              </button>
            </p>
          </>
        )}
        {stop.error && <ErrorMessage error={stop.error} />}
      </>
    );
  return (
    <>
      <p className="hint">Încărcarea este închisă. Dacă o redeschizi, elevii care nu au trimis pot încărca acum.</p>
      <p>
        <button type="button" className="button-quiet" disabled={reopen.isPending} onClick={() => reopen.mutate()}>
          Redeschide încărcarea
        </button>
      </p>
      {reopen.error && <ErrorMessage error={reopen.error} />}
    </>
  );
}

// A test whose uploads closed: grading goes on, or has ended.
function EvaluationState({ test }: { test: TestInfo }) {
  const since = test.evaluationStartedAt ? ` Evaluarea a pornit la ${formatDateTime(test.evaluationStartedAt)}.` : '';
  return <p>{test.status === 'done' ? `Corectarea s-a terminat.${since}` : `Robotul corectează lucrările trimise.${since}`}</p>;
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
