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
import { missingNote, missingOf, type MissingPart } from '../missing.ts';
import { CesVariant, CesWaiting } from './CesVariant.tsx';
import { BaremWaiting, ExerciseListBanner } from './ExerciseListBanner.tsx';
import { SubjectChange } from './SubjectForm.tsx';
import { clearPrint } from './printPdf.ts';
import { PrintTest } from './PrintTest.tsx';
import { isMoveOn, MoveOnLink } from './MoveOnLink.tsx';
import { baremRow, beforeGrading, cesNotReady, cesRows, cesWanted, NowBox, ReadyList, StageSection, testFileRow, UploadsBand, type ReadyRow } from './StageNow.tsx';
import { WaysIn } from './WaysIn.tsx';
import { ReportCard } from './ReportCard.tsx';
import { linksCount, ResultLinksTable } from './ResultLinksTable.tsx';
import { ResultsAccess } from './ResultsAccess.tsx';
import { ReviewOverview, ReviewWaits, showsOverview } from './ReviewOverview.tsx';
import { RobotLine } from './RobotLine.tsx';
import { StartRobotButton, waitsForBarem, waitsForPrint, waitsForRobot } from './StartRobotButton.tsx';
import { TestFiles } from './TestFiles.tsx';
import { PapersProgress } from './PapersProgress.tsx';
import { UploadsTable } from './UploadsTable.tsx';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { t } from '../../i18n/t.ts';

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
// are published, in one line like the others.
const SENTENCES: Record<StageName, string> = {
  Pregătire: t('Încarci testul și baremul. Nu ai un barem pregătit? Generezi automat baremul din test, iar apoi îl poți revizui și ajusta.'),
  Tipărire: t('Tipărești testul. Fiecare pagină are un cod QR.'),
  'În clasă':
    t('Elevii trimit pozele lucrării de pe telefon: scanează codul QR de pe foaia testului sau deschid linkul primit de la tine. Fără cont și fără aplicație.'),
  Corectare: t('Fiecare lucrare primește punctaj după barem, pas cu pas, cu 10 puncte din oficiu.'),
  Verificare: t('Punctele nesigure te așteaptă pe tine. Accepți sau schimbi punctajul.'),
  Rezultate: t('Publici rezultatele. Fiecare elev vede pe linkul lui nota, punctele pe exerciții și explicațiile.'),
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
          {t(stage)}
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
            <strong>{t('Nu corectăm încă această materie.')}</strong> {unsupportedMessage(test.subject.name)}
          </p>
          <p>{t('Dacă materia e alta, schimb-o. Dacă ai ales alt test din greșeală, înlocuiește-l mai jos.')}</p>
          <SubjectChange test={test} onChanged={onChanged} onRobot={onRobot} />
        </div>
      )}
      <PrepareNow test={test} />
      <StageSection title={t('Fișierele')} meta={filesMeta(test)}>
        <TestFiles test={test} onChanged={onChanged} onRobot={onRobot} />
      </StageSection>
      <CesVariant test={test} uploads={uploads} onChanged={onChanged} onRobot={onRobot} />
      {waitsForBarem(test) && (
        <RobotLine lastCheckAt={robot.lastCheckAt} lateText={t('Baremul poate întârzia.')}>
          <StartRobotButton code={test.code} onChanged={onChanged} onRobot={onRobot} />
        </RobotLine>
      )}
    </>
  );
}

// "1 din 2 gata": the test file and an active barem.
function filesMeta(test: TestInfo): string {
  const ready = Number(test.files.test !== null) + Number(test.files.barem !== null && !test.barem.unchecked);
  return ready === 2 ? t('gata') : t('{ready} din 2 gata', { ready });
}

// What a test misses: before its first grading, what missingOf names; after
// it, only a CES barem that CES papers wait for (a class marked a student CES
// later has no CES test for its older tests, and nothing waits for one).
function missingNow(test: TestInfo): MissingPart[] {
  if (beforeGrading(test)) return missingOf(test);
  const { files, barem, waiting } = test.ces;
  return files.test !== null && files.barem === null && waiting > 0 && barem.request !== 'requested' ? ['cesBarem'] : [];
}

// The sentence under a missing part: the test, the barem, or the CES files.
function missingSentence(missing: MissingPart[]): string {
  if (missing.includes('test')) return t('Le încarci mai jos. Din test se face testul cu cod QR pe care îl tipărești.');
  if (missing.includes('barem')) return t('Fără barem, lucrările trimise așteaptă. Îl încarci mai jos sau primești o propunere pe care o verifici tu.');
  return t('Le încarci mai jos, la „Varianta CES”. Fără ele, elevii cu CES nu au ce primi și lucrările lor așteaptă.');
}

// The "Acum" box of Pregătire: what the test still misses, the barem the
// robot makes or the teacher checks, or that both files are ready.
function PrepareNow({ test }: { test: TestInfo }) {
  const before = test.status === 'draft' || test.status === 'open';
  const next = before ? (
    <>
      {t('Tipărești testul cu cod QR la etapa')}{' '}<MoveOnLink stage={'Tipărire'}>{t('Tipărire')}</MoveOnLink>.
    </>
  ) : undefined;
  const missing = missingNow(test);
  // Also a new barem over one that is there, made after the uploads closed.
  if (test.barem.request === 'requested' && (test.files.barem === null || test.status === 'evaluating' || test.status === 'done')) {
    return (
      <NowBox title={t('Se generează baremul')} next={next}>
        <p className="now-sub">{t('Durează câteva minute. Îl verifici aici, când e gata.')}</p>
      </NowBox>
    );
  }
  if (test.files.barem !== null && test.barem.unchecked) {
    return (
      <NowBox label={t('Acum · te așteaptă')} title={t('Verifică baremul generat')} next={next}>
        <p className="now-sub">{t('Citește-l mai jos și confirmă-l. Până atunci, corectarea nu pornește.')}</p>
      </NowBox>
    );
  }
  if (missing.length > 0) {
    const note = missingNote(missing);
    return (
      <NowBox label={t('Acum · te așteaptă')} title={note.charAt(0).toUpperCase() + note.slice(1)} next={next}>
        <p className="now-sub">{missingSentence(missing)}</p>
      </NowBox>
    );
  }
  if ((cesWanted(test) || test.ces.files.test !== null) && test.ces.files.barem !== null && test.ces.barem.unchecked) {
    return (
      <NowBox label={t('Acum · te așteaptă')} title={t('Verifică baremul CES generat')} next={next}>
        <p className="now-sub">{t('Îl găsești mai jos, la „Varianta CES”. Până îl confirmi, lucrările CES așteaptă.')}</p>
      </NowBox>
    );
  }
  if (cesNotReady(test)) {
    return (
      <NowBox title={t('Se generează baremul CES')} next={next}>
        <p className="now-sub">{t('Durează câteva minute. Îl verifici mai jos, la „Varianta CES”, când e gata.')}</p>
      </NowBox>
    );
  }
  return (
    <NowBox title={t('Testul și baremul sunt gata')} done next={next}>
      {test.status === 'evaluating' && <p className="now-sub">{t('Le poți înlocui după ce se termină corectarea.')}</p>}
      {test.status === 'done' && (
        <p className="now-sub">{t('Dacă înlocuiești sau generezi din nou baremul, corectezi din nou lucrările cu „Recorectează tot”, din „Acțiuni”.')}</p>
      )}
    </NowBox>
  );
}

// Whether a PDF to print was made, for the class or the CES test.
function anyPrint(test: TestInfo): boolean {
  return test.print.status === 'ready' || (test.ces.files.test !== null && test.ces.print.status === 'ready');
}

// The "Acum" box of Tipărire: the test with the QR code is made, ready, or
// failed; after the test was given, the files stay to print again.
function PrintNow({ test }: { test: TestInfo }) {
  if (test.status !== 'draft' && test.status !== 'open') {
    return (
      <NowBox title={t('Testul s-a dat în clasă')} done>
        <p className="now-sub">
          {anyPrint(test)
            ? t('Fișierele de tipărit rămân aici, de exemplu pentru un elev care a lipsit.')
            : t('Testul nu a avut o variantă cu cod QR făcută aici.')}
        </p>
      </NowBox>
    );
  }
  const started = test.status === 'open';
  const next = started ? (
    <>
      {t('Elevii trimit lucrările la etapa')}{' '}<MoveOnLink stage={'În clasă'}>{t('În clasă')}</MoveOnLink>.
    </>
  ) : (
    <>
      {t('În ziua testului, îl începi la etapa')}{' '}<MoveOnLink stage={'În clasă'}>{t('În clasă')}</MoveOnLink>.
    </>
  );
  if (test.files.test === null) {
    return (
      <NowBox label={t('Acum · te așteaptă')} title={t('Lipsește testul')} next={next}>
        <ReadyList rows={[testFileRow(test)]} />
      </NowBox>
    );
  }
  // A draft made before tests got their link: the PDF is made only once the
  // teacher asks for it, with the button below.
  if (test.uploadToken === null) {
    return (
      <NowBox label={t('Acum · te așteaptă')} title={t('Testul cu cod QR nu e pregătit')} next={next}>
        <p className="now-sub">{t('Apasă „Pregătește testul cu cod QR” mai jos.')}</p>
      </NowBox>
    );
  }
  if (test.print.status === 'failed') {
    return (
      <NowBox label={t('Acum · te așteaptă')} title={t('Testul cu cod QR nu s-a putut face')} next={next}>
        <p className="now-sub">{t('Încearcă din nou mai jos.')}</p>
      </NowBox>
    );
  }
  if (test.print.status !== 'ready') {
    return (
      <NowBox title={t('Se pregătește testul cu cod QR')} next={next}>
        <p className="now-sub">{t('Durează un minut sau două.')}</p>
      </NowBox>
    );
  }
  return (
    <NowBox title={t('Testul cu cod QR e gata de tipărit')} done next={next}>
      <p className="now-sub">
        {started
          ? t('Testul a început. Îl poți tipări din nou, de exemplu pentru un elev care a lipsit.')
          : t('Tipărește-l din timp, înainte de ziua testului. Fiecare pagină are codul.')}
      </p>
    </NowBox>
  );
}

function PrintPanel({ test, robot, onChanged, onRobot }: PanelProps) {
  // Leaving Tipărire removes the hidden frame of the last "Tipărește".
  useEffect(() => clearPrint, []);
  // After the test was given, the PDFs made before stay here to print again.
  if (test.status !== 'draft' && test.status !== 'open') {
    return (
      <>
        <PrintNow test={test} />
        {anyPrint(test) && (
          <StageSection title={t('De tipărit')}>
            {test.print.status === 'ready' && <PrintTest test={test} onChanged={onChanged} onRobot={onRobot} />}
            {test.ces.files.test !== null && test.ces.print.status === 'ready' && (
              <PrintTest test={test} variant="ces" onChanged={onChanged} onRobot={onRobot} />
            )}
          </StageSection>
        )}
      </>
    );
  }
  return (
    <>
      <PrintNow test={test} />
      <StageSection title={t('De tipărit')}>
        <PrintTest test={test} onChanged={onChanged} onRobot={onRobot} />
        {test.ces.files.test !== null && <PrintTest test={test} variant="ces" onChanged={onChanged} onRobot={onRobot} />}
      </StageSection>
      {waitsForPrint(test) && (
        <RobotLine lastCheckAt={robot.lastCheckAt} lateText={t('Testul cu cod QR poate întârzia.')}>
          <StartRobotButton code={test.code} onChanged={onChanged} onRobot={onRobot} />
        </RobotLine>
      )}
    </>
  );
}

// The numbers of the class: who sent, and who did not yet.
function sentTitle(test: TestInfo): string {
  return t(test.submittedCount === 1 ? '{submittedCount} din {countLabel} a trimis lucrarea' : '{submittedCount} din {countLabel} au trimis lucrarea', { submittedCount: test.submittedCount, countLabel: countLabel(test.studentCount, 'elev', 'elevi') });
}

function notSent(test: TestInfo): string {
  const left = Math.max(0, test.studentCount - test.submittedCount);
  if (left === 0) return t('Au trimis toți elevii.');
  return t('{countLabel} trimis încă.', { countLabel: countLabel(left, 'elev nu a', 'elevi nu au') });
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
          <StageSection title={t('Cum trimit elevii lucrarea')}>
            <p className="hint">{t('Încărcarea e închisă: linkurile nu primesc lucrări până o redeschizi. Codul QR de pe foaie rămâne același.')}</p>
          </StageSection>
        )
      )}
      {test.status === 'open' && <StopTest {...props} />}
      {nothingYet ? (
        <EmptyState icon={<IconQr />} title={t('Nicio lucrare trimisă încă')}>
          {closed
            ? t('Încărcarea e închisă. Lucrările apar aici după ce o redeschizi și elevii trimit pozele.')
            : t('Elevii scanează codul QR de pe test și trimit pozele. Lucrările apar aici pe măsură ce vin.')}
        </EmptyState>
      ) : (
        test.status !== 'draft' && <Papers {...props} selectable={false} />
      )}
    </>
  );
}

// The test with the QR code as a row of a stage's list.
function printRow(test: TestInfo): ReadyRow {
  if (test.print.status === 'ready') return { state: 'done', what: t('Testul cu cod QR'), value: t('gata de tipărit') };
  if (test.files.test === null) return { state: 'later', what: t('Testul cu cod QR'), value: t('după ce încarci testul'), stage: 'Tipărire' };
  if (test.uploadToken === null) return { state: 'wait', what: t('Testul cu cod QR'), value: t('nepregătit'), stage: 'Tipărire' };
  if (test.print.status === 'failed') return { state: 'wait', what: t('Testul cu cod QR'), value: t('nu s-a putut face'), stage: 'Tipărire' };
  return { state: 'later', what: t('Testul cu cod QR'), value: t('se pregătește'), stage: 'Tipărire' };
}

// What the test needs before the teacher starts it in class. It never blocks
// the start: a missing part only makes papers wait later.
function ClassReady({ test }: { test: TestInfo }) {
  const rows = [testFileRow(test), baremRow(test), ...cesRows(test), printRow(test)];
  return (
    <>
      <ReadyList rows={rows} />
      {rows.some((row) => row.state === 'wait') && <p className="now-sub">{t('Poți începe oricum. Ce lipsește adaugi și după, la etapa Pregătire.')}</p>}
    </>
  );
}

function classNext() {
  return (
    <>
      {t('Corectarea o pornești la etapa')}{' '}<MoveOnLink stage="Corectare">{t('Corectare')}</MoveOnLink>{t(', acum sau mai târziu.')}
    </>
  );
}

// The line over "Redeschide încărcarea" once the uploads closed: who did not
// send and what a reopen is for, or only that everyone sent.
function closedLine(test: TestInfo): string {
  const left = Math.max(0, test.studentCount - test.submittedCount);
  if (left === 0) return t('Au trimis toți elevii.');
  const theirs = left === 1 ? t('lucrarea lui') : t('lucrările lor');
  return t('Elevii nu mai pot trimite. {countLabel} trimis. Redeschide dacă mai vrei {theirs}. Notele date nu se schimbă.', { countLabel: countLabel(left, 'elev nu a', 'elevi nu au'), theirs });
}

// What a reopen does while the robot still grades.
const REOPEN_WHILE_GRADING = t('Dacă redeschizi acum, lucrările care nu sunt gata așteaptă din nou, până pornești corectarea pentru toate.');

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
      <NowBox label={t('Acum')} title={t('Testul nu a început')} next={t('Elevii trimit pozele lucrării. Le vezi aici, pe măsură ce vin.')}>
        <p className="now-sub">{t('Elevii nu pot trimite lucrări încă. Începe testul în ziua testului, când împarți foile: atunci primește data.')}</p>
        <div className="now-actions">
          <button type="button" className="button" disabled={start.isPending} onClick={() => start.mutate()}>
            <ActionIcon name="play" />
            {t('Începe testul')}
          </button>
        </div>
        <ClassReady test={test} />
        {start.error && <ErrorMessage error={start.error} />}
      </NowBox>
    );
  }
  if (test.status === 'open') {
    const since = test.startedAt ? t('Testul a început pe {formatDateTime}. ', { formatDateTime: formatDateTime(test.startedAt) }) : '';
    return (
      <NowBox band={<UploadsBand test={test} onChanged={onChanged} />} title={sentTitle(test)} next={classNext()}>
        <p className="now-sub">{test.uploadsClosedAt !== null ? t('Lucrările așteaptă să pornești corectarea.') : `${since}${notSent(test)}`}</p>
        <ScheduledStart test={test} onChanged={onChanged} />
      </NowBox>
    );
  }
  const closedAt = test.evaluationStartedAt ? t(' pe {formatDateTime}', { formatDateTime: formatDateTime(test.evaluationStartedAt) }) : '';
  return (
    <NowBox
      label={t('Acum · încărcarea s-a închis{closedAt}', { closedAt })}
      title={sentTitle(test)}
      next={
        test.status === 'done' ? (
          <>
            {t('Corectarea s-a terminat. Verifici punctele nesigure la etapa')}{' '}<MoveOnLink stage="Verificare">{t('Verificare')}</MoveOnLink>.
          </>
        ) : (
          <>
            {t('Se corectează lucrările la etapa')}{' '}<MoveOnLink stage="Corectare">{t('Corectare')}</MoveOnLink>: {test.gradedCount}{' '}{t('din')}{' '}{test.submittedCount}{' '}{t('gata.')}
          </>
        )
      }
    >
      <p className="now-sub">{closedLine(test)}</p>
      <div className="now-actions">
        <button type="button" className="button-quiet" disabled={reopen.isPending} onClick={() => reopen.mutate()}>
          <ActionIcon name="retry" />
          {t('Redeschide încărcarea')}
        </button>
        {test.status === 'evaluating' && <p className="hint">{REOPEN_WHILE_GRADING}</p>}
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
          <span className="hint">{t('Ai început testul din greșeală?')}</span>
          <button
            type="button"
            className="button-quiet button-small"
            disabled={stop.isPending}
            onClick={() => {
              const schedule = test.evaluationAt ? ` ${t('Corectarea programată se anulează.')}` : '';
              const question = t('Oprești testul? Elevii nu mai pot încărca lucrările până îl începi din nou, iar data testului se șterge.{schedule}', { schedule });
              if (window.confirm(question)) stop.mutate();
            }}
          >
            <ActionIcon name="stop" />
            {t('Oprește testul')}
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
        <span>{t('Corectarea pornește automat la {formatDateTime}.', { formatDateTime: formatDateTime(test.evaluationAt) })}</span>
        <button type="button" className="button-quiet button-small" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
          <ActionIcon name="close" />
          {t('Anulează programarea')}
        </button>
      </p>
      {cancel.error && <ErrorMessage error={cancel.error} />}
    </>
  );
}

function gradingNext() {
  return (
    <>
      {t('Verifici punctele nesigure la etapa')}{' '}<MoveOnLink stage="Verificare">{t('Verificare')}</MoveOnLink>.
    </>
  );
}

// Corectare (design A): the "Acum" box with the one action of the stage, by
// the state of the test, then the papers.
function GradingPanel(props: PanelProps) {
  const { test, uploads, robot, selected, onChanged, onRobot } = props;
  if (test.status === 'draft') {
    return (
      <>
        <NowBox label={t('Acum · corectarea nu a început')} title={t('Corectarea pornește după ce elevii trimit lucrările')} next={gradingNext()}>
          <ReadyList
            rows={[
              testFileRow(test),
              baremRow(test),
              ...cesRows(test),
              { state: 'later', what: t('Testul început'), value: t('nu încă: îl începi în ziua testului'), stage: 'În clasă' },
              { state: 'later', what: t('Lucrări trimise'), value: t('0 din {countLabel}', { countLabel: countLabel(test.studentCount, 'elev', 'elevi') }) },
            ]}
          />
        </NowBox>
        <Papers {...props} selectable={false} />
      </>
    );
  }
  return (
    <>
      <ExerciseListBanner test={test} onChanged={onChanged} onRobot={onRobot} />
      <ExerciseListBanner test={test} variant="ces" onChanged={onChanged} onRobot={onRobot} />
      <BaremWaiting test={test} />
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
    return uploads.some((row) => row.status === 'graded') ? t('Toate lucrările trimise sunt corectate') : t('Nicio lucrare trimisă nu așteaptă corectarea');
  }
  return t('{countLabel} corectarea', { countLabel: countLabel(waiting, 'lucrare așteaptă', 'lucrări așteaptă') });
}

// The papers a student is still sending, with files: they can be graded too
// while they stay checked in the table.
function StillSending({ uploads }: { uploads: UploadRow[] }) {
  const sending = uploads.filter((row) => row.status === 'uploading' && row.fileCount > 0).length;
  if (sending === 0) return null;
  return (
    <p className="now-sub">
      {sending === 1 ? t('Încă 1 elev își încarcă lucrarea') : t('Încă {countLabel} își încarcă lucrarea', { countLabel: countLabel(sending, 'elev', 'elevi') })}{t(': o poți corecta și pe ea cât e bifată în tabel.')}
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
  const since = test.evaluationStartedAt ? t(' · corectarea a pornit pe {formatDateTime}', { formatDateTime: formatDateTime(test.evaluationStartedAt) }) : '';
  if (test.status === 'done') {
    return (
      <NowBox label={`${t('Acum')}${since}`} title={t('Corectarea s-a terminat')} next={gradingNext()}>
        <p className="now-sub">{countLabel(test.gradedCount, 'lucrare corectată', 'lucrări corectate')}.</p>
      </NowBox>
    );
  }
  const sent = uploads.filter((row) => row.status === 'graded' || row.status === 'grading' || row.status === 'submitted' || row.status === 'failed').length;
  return (
    <NowBox label={`${t('Acum')}${since}`} title={t('Se corectează: {gradedCount} din {countLabel} gata', { gradedCount: test.gradedCount, countLabel: countLabel(sent, 'lucrare', 'lucrări') })} next={gradingNext()}>
      <span className="now-bar" aria-hidden="true">
        <span style={{ width: `${sent === 0 ? 0 : (test.gradedCount / sent) * 100}%` }} />
      </span>
      <p className="now-sub">{t('Lucrările apar în tabel pe măsură ce sunt gata. Poți închide pagina.')}</p>
      <p className="now-sub">{closedLine(test)}</p>
      <div className="now-actions">
        <button type="button" className="button-quiet button-small" disabled={reopen.isPending} onClick={() => reopen.mutate()}>
          <ActionIcon name="retry" />
          {t('Redeschide încărcarea')}
        </button>
        <p className="hint">{REOPEN_WHILE_GRADING}</p>
      </div>
      {reopen.error && <ErrorMessage error={reopen.error} />}
    </NowBox>
  );
}

function ReviewPanel({ test, uploads }: PanelProps) {
  if (!showsOverview(test)) return <ReviewWaits test={test} />;
  return <ReviewOverview test={test} uploads={uploads} />;
}

// The results (redesign spec §8, spec 2026-11-14): publishing at the top,
// then the students' links beside "Raportul clasei". The links table takes
// the place of the papers table here.
function ResultsPanel({ test, uploads, onChanged }: PanelProps) {
  const count = linksCount(uploads, test.resultsOpen);
  return (
    <>
      <ResultsAccess test={test} onChanged={onChanged} />
      <div className="results-layout">
        <div className="results-grid">
          <ReportCard test={test} uploads={uploads} />
          <div className="results-students">
            <StageSection title={t('Elevii')} meta={count && <span className={count.all ? 'tag tag-ok' : 'tag'}>{count.text}</span>}>
              <ResultLinksTable code={test.code} uploads={uploads} resultsOpen={test.resultsOpen} started={test.status !== 'draft'} onChanged={onChanged} />
            </StageSection>
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
    <div className="stage-section">
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
    </div>
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
  const what = pending.length === 1 ? t('1 lucrare cu fișiere nu a fost corectată') : t('{length} lucrări cu fișiere nu au fost corectate', { length: pending.length });
  return (
    <div className="warning" role="status">
      <p>
        <strong>{t('Evaluare parțială.')}</strong> {what}{t('. Redeschide încărcarea și pornește evaluarea pentru ele.')}
      </p>
    </div>
  );
}
