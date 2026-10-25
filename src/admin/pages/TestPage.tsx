import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import type { RobotStart, TestInfo, UploadRow } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { MAX_TITLE_LENGTH, normalizeTestCode, type TestStatus } from '../../../shared/tests.ts';
import { classToneClass, classToneStyle } from '../../ui/classTone.ts';
import { formatDateTime, robotStartMessage } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { StatusChip } from '../StatusChip.tsx';
import { EvaluationControls } from '../testPage/EvaluationControls.tsx';
import { AnalysisState } from '../testPage/AnalysisState.tsx';
import { ExerciseListBanner } from '../testPage/ExerciseListBanner.tsx';
import { PrintTest } from '../testPage/PrintTest.tsx';
import { RegradeAllButton } from '../testPage/RegradeAllButton.tsx';
import { ResultsAccess } from '../testPage/ResultsAccess.tsx';
import { RobotLine } from '../testPage/RobotLine.tsx';
import { StartRobotButton, waitsForPrint, waitsForRobot } from '../testPage/StartRobotButton.tsx';
import { TestFiles } from '../testPage/TestFiles.tsx';
import { MultiUploadLink, UploadLink } from '../testPage/UploadLink.tsx';
import { UploadsTable } from '../testPage/UploadsTable.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

// While students upload (and later while the robot grades), the page asks for
// news every 10 seconds.
export function refreshInterval(status: TestStatus | undefined): number | false {
  return status === 'open' || status === 'evaluating' ? 10_000 : false;
}

export function TestPage() {
  const code = normalizeTestCode(useParams().code ?? '');
  if (code === null) return <NotFoundPage />;
  return <TestDetails key={code} code={code} />;
}

function TestDetails({ code }: { code: string }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  // When the robot starts, after the teacher started or restarted grading.
  const [robotNotice, setRobotNotice] = useState<string | null>(null);
  const onRobot = (robot: RobotStart | null) => setRobotNotice(robot ? robotStartMessage(robot) : null);
  // The rename form opens below the title; its button stays in the title row.
  const [renameOpen, setRenameOpen] = useState(false);
  // The uploads to grade at the next Start evaluation (submission ids).
  // Empty at first, so the start button stays off until the teacher selects.
  const [selected, setSelected] = useState<number[]>([]);
  const detail = useQuery({
    queryKey: ['test', code],
    queryFn: () => api.getTest(code),
    refetchInterval: (query) => refreshInterval(query.state.data?.test.status),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['test', code] });
    await queryClient.invalidateQueries({ queryKey: ['tests'] });
  };
  const remove = useMutation({
    mutationFn: () => api.deleteTest(code),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tests'] });
      navigate('/');
    },
  });

  const archive = useMutation({
    mutationFn: (archived: boolean) => api.setTestArchived(code, archived),
    onSuccess: refresh,
  });

  if (detail.isPending) return <p>Se încarcă…</p>;
  // A failed first load has nothing to show. A failed refresh keeps the page,
  // and an open QR view with it, and says why above it.
  if (detail.data === undefined) return <ErrorMessage error={detail.error} />;

  const { test, uploads, robot, showModel } = detail.data;
  // A failed robot start that the API kept: a scheduled start happens in any
  // request, so only the API knows of it. A button's answer says the same.
  // An open test waits for the robot only for its print PDF.
  const printWaits = waitsForPrint(test);
  const robotText = (test.status === 'evaluating' || printWaits) && robot.startFailed ? robotStartMessage('next_check') : robotNotice;
  return (
    <section>
      <p className="back-link">
        <Link to="/">← Toate testele</Link>
      </p>
      {detail.isRefetchError && <ErrorMessage error={detail.error} />}
      {notice && (
        <p className="alert" role="alert">
          {notice}
        </p>
      )}
      <div className="page-head">
        <h1>{test.code}</h1>
        <span className="head-actions">
          <StatusChip status={test.status} />
          {test.archived && <span className="tag">Arhivat</span>}
          {test.gradedCount > 0 && (
            <Link className="button button-small" to={`/teste/${test.code}/raport`}>
              Raportul clasei
            </Link>
          )}
          {!renameOpen && (
            <button type="button" className="button-quiet button-small" onClick={() => setRenameOpen(true)}>
              Redenumește testul
            </button>
          )}
        </span>
      </div>
      <p className="lead-line">
        {test.title} ·{' '}
        <Link className={`class-badge ${classToneClass()}`} style={classToneStyle(test.classId)} to={`/clase/${test.classId}`}>
          {displayClassName(test.className)}
        </Link>
        {test.startedAt && ` · început ${formatDateTime(test.startedAt)}`}
      </p>
      {renameOpen && <RenameTestForm code={code} currentTitle={test.title} onDone={refresh} onClose={() => setRenameOpen(false)} />}

      <TestFiles test={test} onChanged={refresh} onRobot={onRobot} />

      <h2>Încărcarea lucrărilor</h2>
      <TestActions test={test} onChanged={refresh} onRobot={onRobot} />

      {test.status !== 'draft' && (
        <>
          <h2>Evaluarea</h2>
          <ExerciseListBanner test={test} onChanged={refresh} onRobot={onRobot} />
          {test.status === 'open' ? (
            <EvaluationControls
              test={test}
              uploads={uploads}
              selected={selected}
              onChanged={refresh}
              onStarted={() => setSelected([])}
              onRobot={onRobot}
            />
          ) : (
            <EvaluationState test={test} />
          )}
          {test.status === 'done' && <PartialEvaluationNotice uploads={uploads} />}
          {robotText && <p role="status">{robotText}</p>}
          {(test.status === 'evaluating' || test.evaluationAt || printWaits) && (
            <RobotLine lastCheckAt={robot.lastCheckAt}>
              {waitsForRobot(test, uploads) && <StartRobotButton code={code} onChanged={refresh} onRobot={onRobot} />}
            </RobotLine>
          )}
          <RegradeAllButton code={code} testStatus={test.status} uploads={uploads} onChanged={refresh} onRobot={onRobot} />
          <AnalysisState test={test} uploads={uploads} />
        </>
      )}

      {test.status !== 'draft' && <ResultsAccess test={test} uploads={uploads} onChanged={refresh} />}

      <h2>
        Încărcări · trimise {test.submittedCount} din {test.studentCount}
        {test.gradedCount > 0 && ` · corectate ${test.gradedCount}`}
        {test.flagCount > 0 && ` · de verificat ${test.flagCount}`}
      </h2>
      <UploadsTable
        code={code}
        uploads={uploads}
        showModel={showModel}
        selectable={test.status === 'open'}
        selected={selected}
        onSelect={setSelected}
        onChanged={refresh}
        onRobot={onRobot}
        resultsOpen={test.resultsOpen}
      />

      <div className="final-actions">
        {(test.archived || test.status === 'done') && (
          <div className="final-row">
            {test.archived ? (
              <button type="button" className="button-quiet button-small" disabled={archive.isPending} onClick={() => archive.mutate(false)}>
                Scoate din arhivă
              </button>
            ) : (
              <>
                <button type="button" className="button-quiet button-small" disabled={archive.isPending} onClick={() => archive.mutate(true)}>
                  Arhivează testul
                </button>
                <p className="hint">Testul nu mai apare în lista clasei și în Teste. Îl găsești cu „Arată și testele arhivate”.</p>
              </>
            )}
            {archive.error && <ErrorMessage error={archive.error} />}
          </div>
        )}
        <div className="final-row">
          <button
            type="button"
            className="button-quiet button-small button-danger"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(`Ștergi testul ${code}? Se șterg și toate lucrările încărcate.`)) remove.mutate();
            }}
          >
            Șterge testul
          </button>
          <p className="hint">Se șterg și toate lucrările încărcate de elevi.</p>
          {remove.error && <ErrorMessage error={remove.error} />}
        </div>
      </div>
    </section>
  );
}

// Whether the upload links of a test show in this browser. Visible unless the
// teacher hid them; the choice survives a reload.
function linksStorageKey(code: string): string {
  return `qe.uploadLinksVisible.${code}`;
}

function readLinksVisible(code: string): boolean {
  try {
    return localStorage.getItem(linksStorageKey(code)) !== '0';
  } catch {
    return true;
  }
}

function writeLinksVisible(code: string, visible: boolean): void {
  try {
    localStorage.setItem(linksStorageKey(code), visible ? '1' : '0');
  } catch {
    // A browser without storage keeps the links as they are.
  }
}

// What the teacher can do next, by the state of the test.
function TestActions({
  test,
  onChanged,
  onRobot,
}: {
  test: TestInfo;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const api = useApi();
  const start = useMutation({ mutationFn: () => api.startTest(test.code),
    onSuccess: async (started) => {
      onRobot(started.robot);
      await onChanged();
    },
  });
  const reopen = useMutation({ mutationFn: () => api.reopenTest(test.code),
    onSuccess: async (reopened) => {
      onRobot(reopened.robot);
      await onChanged();
    },
  });
  // The upload links stay visible while the class uploads, and the teacher
  // hides them for a cleaner page once the files are in. Kept per test in
  // this browser, so a reload keeps the page as the teacher left it.
  const [linksVisible, setLinksVisible] = useState(() => readLinksVisible(test.code));
  useEffect(() => {
    writeLinksVisible(test.code, linksVisible);
  }, [test.code, linksVisible]);

  if (test.status === 'draft') {
    return (
      <>
        <p className="hint">Elevii pot încărca lucrările după ce începi testul. Atunci apar linkul și codul QR.</p>
        <button type="button" className="button" disabled={start.isPending} onClick={() => start.mutate()}>
          Începe testul
        </button>
        {start.error && <ErrorMessage error={start.error} />}
      </>
    );
  }
  if (test.status === 'open' && test.uploadToken)
    return (
      <>
        <p>
          <button
            type="button"
            className="button-quiet button-small"
            aria-expanded={linksVisible}
            onClick={() => setLinksVisible((visible) => !visible)}
          >
            {linksVisible ? 'Ascunde linkurile' : 'Arată linkurile'}
          </button>
        </p>
        {linksVisible && (
          <>
            <UploadLink token={test.uploadToken} />
            <MultiUploadLink code={test.code} token={test.multiUploadToken} onChanged={onChanged} />
          </>
        )}
        <PrintTest test={test} onChanged={onChanged} onRobot={onRobot} />
      </>
    );
  return (
    <>
      <p className="hint">Încărcarea este închisă. Dacă o redeschizi, elevii care nu au trimis pot încărca acum.</p>
      <button type="button" className="button-quiet" disabled={reopen.isPending} onClick={() => reopen.mutate()}>
        Redeschide încărcarea
      </button>
      {reopen.error && <ErrorMessage error={reopen.error} />}
    </>
  );
}

// A test whose uploads closed: grading goes on, or has ended.
function EvaluationState({ test }: { test: TestInfo }) {
  const since = test.evaluationStartedAt ? ` Evaluarea a pornit la ${formatDateTime(test.evaluationStartedAt)}.` : '';
  return <p>{test.status === 'done' ? `Corectarea s-a terminat.${since}` : `Robotul corectează lucrările trimise.${since}`}</p>;
}

// After a finished evaluation with uploads that still wait for grading.
function PartialEvaluationNotice({ uploads }: { uploads: UploadRow[] }) {
  const pending = uploads.filter((row) => row.fileCount > 0 && (row.status === 'uploading' || row.status === 'submitted'));
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

function RenameTestForm({
  code,
  currentTitle,
  onDone,
  onClose,
}: {
  code: string;
  currentTitle: string;
  onDone: () => Promise<void>;
  onClose: () => void;
}) {
  const api = useApi();
  const [title, setTitle] = useState(currentTitle);
  const rename = useMutation({
    mutationFn: () => api.renameTest(code, title),
    onSuccess: async () => {
      onClose();
      await onDone();
    },
  });

  return (
    <form
      className="form-row"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        rename.mutate();
      }}
    >
      <label htmlFor="rename-test">Titlu nou</label>
      <input id="rename-test" type="text" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={MAX_TITLE_LENGTH} required />
      <button className="button button-small" type="submit" disabled={rename.isPending}>
        Salvează
      </button>
      <button type="button" className="button-quiet button-small" onClick={onClose}>
        Renunță
      </button>
      {rename.error && <ErrorMessage error={rename.error} />}
    </form>
  );
}
