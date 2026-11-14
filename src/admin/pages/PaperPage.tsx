import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import type { ItemChange, ReviewPoint, SubmissionDetail, TestDetail } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { parsePositiveId } from '../../../shared/ids.ts';
import { normalizeTestCode } from '../../../shared/tests.ts';
import { ApiError } from '../../ui/ApiError.ts';
import { useApi } from '../ApiContext.tsx';
import { Crumbs } from '../Crumbs.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { PaperHead, usePaperActions } from '../paperPage/PaperHead.tsx';
import { listedPapers, modeOf, paperPath, studentSpot, walkedPoints, type PaperMode, type PaperPlace, type PaperSpot } from '../paperPage/paths.ts';
import { PointDecision, type DecisionView } from '../paperPage/PointDecision.tsx';
import { StudentList } from '../paperPage/StudentList.tsx';
import { drawnAreas, saveFrames, savedFrames } from '../reviewPage/areas.ts';
import { isReviewKey } from '../reviewPage/keys.ts';
import { firstSpot, isSpotOf, pageIndex, pointKey, pointQueue, stepPoint, withoutPoint, type QueuedPoint } from '../reviewPage/points.ts';
import { type ReviewFocus, ReviewPhoto } from '../reviewPage/ReviewPhoto.tsx';
import { stageHash } from '../stages.ts';
import { GradedResult } from '../submissionPage/GradedResult.tsx';
import { waitingText } from '../submissionPage/waitingText.ts';
import { heldBackHint } from '../testPage/paperCounts.ts';
import { NotFoundPage } from './NotFoundPage.tsx';

// While the robot grades the upload, the page asks for news every 10 seconds.
export function resultRefreshInterval(submission: SubmissionDetail | undefined): number | false {
  if (!submission) return false;
  const waits = submission.status === 'grading' || (submission.status === 'submitted' && submission.testStatus === 'evaluating');
  return waits ? 10_000 : false;
}

// /teste/:code/elevi/:submissionId: the paper page (spec 2026-11-12 §4): the
// students, all the exercises of one student (or only the points to check),
// and the paper, side by side.
export function PaperPage() {
  const params = useParams();
  const code = normalizeTestCode(params.code ?? '');
  const submissionId = parsePositiveId(params.submissionId);
  if (code === null || submissionId === null) return <NotFoundPage />;
  return <PaperLoader key={code} code={code} place="app" submissionId={submissionId} />;
}

// /teste/:code/verificare in the teacher app: the paper page with only the
// points to check, at the paper and point the address names (`?lucrare=12&punct=34`),
// else at the first point. Before any paper is graded: the test's Verificare.
export function ReviewRedirect() {
  const code = normalizeTestCode(useParams().code ?? '');
  if (code === null) return <NotFoundPage />;
  return <RedirectLoader key={code} code={code} />;
}

function useTestDetail(code: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['test', code],
    queryFn: () => api.getTest(code),
  });
}

// The spot an address of the review names, when the paper is of this test,
// else the first point (or the first graded paper).
function askedSpot(detail: TestDetail, params: URLSearchParams): PaperSpot | null {
  const asked = parsePositiveId(params.get('lucrare') ?? undefined);
  // (A student who sent nothing has no paper id: no address names that row.)
  const named = asked !== null && detail.uploads.some((row) => row.submissionId === asked);
  return named ? { submissionId: asked, key: params.get('punct') } : null;
}

function RedirectLoader({ code }: { code: string }) {
  const detail = useTestDetail(code);
  const [params] = useSearchParams();
  if (detail.isPending) return <p>Se încarcă…</p>;
  if (detail.data === undefined) return <ErrorMessage error={detail.error} />;
  const spot = askedSpot(detail.data, params) ?? firstSpot(detail.data.uploads);
  if (spot === null) return <Navigate replace to={`/teste/${code}${stageHash('Verificare')}`} />;
  return <Navigate replace to={paperPath(code, 'app', spot, 'verificare')} />;
}

// A Quick Try's review (`/teste/:code/verificare` inside the try's router): the
// same page, for the try's one paper. An address that names no paper of this
// test is first written with the spot the page opens on, and only then is the
// paper drawn: no decision is made on a spot the address does not hold.
export function TryPaperPage() {
  const code = normalizeTestCode(useParams().code ?? '');
  if (code === null) return <NotFoundPage />;
  return <TryPaperLoader key={code} code={code} />;
}

function TryPaperLoader({ code }: { code: string }) {
  const detail = useTestDetail(code);
  const [params] = useSearchParams();
  if (detail.isPending) return <p>Se încarcă…</p>;
  if (detail.data === undefined) return <ErrorMessage error={detail.error} />;
  const asked = askedSpot(detail.data, params);
  if (asked === null) {
    const opening = firstSpot(detail.data.uploads);
    if (opening !== null) return <Navigate replace to={paperPath(code, 'try', opening, modeOf(params, 'try'))} />;
    return (
      <section className="paper-page">
        <p className="hint">Nicio lucrare nu este corectată încă.</p>
        <Link to={`/teste/${code}${stageHash('Verificare')}`}>Înapoi la test</Link>
      </section>
    );
  }
  return <Paper code={code} place="try" submissionId={asked.submissionId} detail={detail.data} refreshError={detail.isRefetchError ? detail.error : null} />;
}

function PaperLoader({ code, place, submissionId }: { code: string; place: PaperPlace; submissionId: number }) {
  const detail = useTestDetail(code);
  if (detail.isPending) return <p>Se încarcă…</p>;
  // The address names a test the teacher does not have.
  if (detail.error instanceof ApiError && detail.error.status === 404) return <NotFoundPage />;
  // A failed first load has nothing to show; a failed refresh keeps the page.
  if (detail.data === undefined) return <ErrorMessage error={detail.error} />;
  // Each paper is a page of its own: nothing chosen on one stays for another.
  return (
    <Paper
      key={submissionId}
      code={code}
      place={place}
      submissionId={submissionId}
      detail={detail.data}
      refreshError={detail.isRefetchError ? detail.error : null}
    />
  );
}

interface Decision {
  submission: SubmissionDetail;
  view: DecisionView;
  point: ReviewPoint | null;
  change: ItemChange;
}

// After a decision: the point that opens takes the focus on its heading, or,
// when the student has no point left, "Elevul următor". The address carries
// it: the page is drawn anew for another student.
type FocusTarget = 'point' | 'student';

// A click that opened another row says so to the address it leads to: the
// row open before stays open (kept). A key or a button that moves does not.
function keepsRowOf(state: unknown): boolean {
  return (state as { paperKeep?: unknown } | null)?.paperKeep === true;
}

function focusTargetOf(state: unknown): FocusTarget | null {
  const target = (state as { paperFocus?: unknown } | null)?.paperFocus;
  return target === 'point' || target === 'student' ? target : null;
}

// "Elevii" and the paper, folded or not: the teacher's choice, kept in this
// browser.
const FOLD_KEY = 'quickeval:paperStudentsFolded';
const PHOTO_FOLD_KEY = 'quickeval:paperPhotoFolded';

function savedFold(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'on';
  } catch {
    return false;
  }
}

function saveFold(key: string, folded: boolean): void {
  try {
    localStorage.setItem(key, folded ? 'on' : 'off');
  } catch {
    // Storage can be blocked; the choice then lasts until the page reloads.
  }
}

function Paper({
  code,
  place,
  submissionId,
  detail,
  refreshError,
}: {
  code: string;
  place: PaperPlace;
  submissionId: number;
  detail: TestDetail;
  refreshError: Error | null;
}) {
  const api = useApi();
  // The account, for why a held-back paper waits; a Quick Try has no account.
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me(), enabled: place === 'app' });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const mode = modeOf(params, place);
  const key = params.get('punct');
  const spot: PaperSpot = { submissionId, key };
  const { test, uploads } = detail;
  const row = uploads.find((other) => other.submissionId === submissionId);
  const queue = pointQueue(uploads);
  const walked = walkedPoints(uploads, mode, submissionId);
  // The spot and the view on the screen now, for a decision that comes back
  // later.
  const shown = useRef({ spot, mode });
  useEffect(() => {
    shown.current = { spot, mode };
  });

  const paper = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => api.getSubmission(submissionId),
    refetchInterval: (query) => resultRefreshInterval(query.state.data),
  });
  const submission = paper.data;
  const evaluation = submission?.status === 'graded' ? (submission.evaluation ?? null) : null;

  // The list has another grading of the paper than the one read (it was graded
  // again; the list is read every 10 s while the robot works): read the paper
  // again, so its new result shows.
  const listGradedAt = row?.gradedAt ?? null;
  const stale = submission !== undefined && row !== undefined && listGradedAt !== (evaluation?.gradedAt ?? null);
  useEffect(() => {
    if (stale) void queryClient.invalidateQueries({ queryKey: ['submission', submissionId] }, { cancelRefetch: false });
  }, [stale, listGradedAt, submissionId, queryClient]);

  const actions = usePaperActions(code, submissionId);

  // What waits on a row: an exercise to check, or the pages the robot could
  // not read; null once it is checked.
  const viewOf = (at: string | null): DecisionView | null => {
    if (!evaluation || at === null) return null;
    if (at === 'pagini') return evaluation.unreadable.length > 0 && !evaluation.pagesReviewed ? { kind: 'pages', pages: evaluation.unreadable } : null;
    const found = evaluation.items.find((other) => String(other.id) === at);
    return found && found.needsReview && !found.reviewed ? { kind: 'item', item: found } : null;
  };
  // The open row and what waits on it.
  const item = key !== null && key !== 'pagini' ? evaluation?.items.find((other) => String(other.id) === key) : undefined;
  const decisionView = viewOf(key);

  // A row to check stays open, its decision dimmed, when the teacher clicks
  // another row, until she closes it or checks it: a decision that closed
  // above the row she clicks would move that row up under her pointer. A move
  // with J, K or the buttons, and a row she closed herself, keep nothing. Each
  // paper starts with none.
  const keepsRow = keepsRowOf(location.state);
  const [kept, setKept] = useState<{ at: string | null; keys: string[] }>({ at: key, keys: [] });
  if (kept.at !== key) {
    const left = kept.at !== null && keepsRow ? [kept.at] : [];
    setKept({ at: key, keys: [...kept.keys, ...left].filter((other, index, all) => other !== key && all.indexOf(other) === index) });
  }
  const keptKeys = kept.keys.filter((other) => other !== key && viewOf(other) !== null);

  // The answer of the open row, with the areas the page can draw.
  const [frames, setFrames] = useState(savedFrames);
  const focus: ReviewFocus | null =
    item && submission ? { key: `${submission.id}:${item.id}`, label: item.exerciseId, areas: drawnAreas(item.areas, submission.files) } : null;
  const onFrames = (on: boolean) => {
    setFrames(on);
    saveFrames(on);
  };

  // The page of the paper: the page of the first area of the open answer
  // (while its border shows), else the page of the answer, or the first page
  // the robot could not read, else page 1; a page the teacher chose stays
  // until the open row changes.
  const viewKey = `${submissionId}:${key ?? ''}`;
  const [pageChoice, setPageChoice] = useState<{ view: string; page: number } | null>(null);
  const pageCount = submission?.files.length ?? 0;
  const firstArea = frames ? focus?.areas[0] : undefined;
  const firstPage =
    key === 'pagini' && evaluation
      ? (pageIndex(evaluation.unreadable[0] ?? '') ?? 0)
      : firstArea
        ? firstArea.page - 1
        : item && item.page >= 1 && item.page <= pageCount
          ? item.page - 1
          : 0;
  const shownPage = pageChoice?.view === viewKey ? pageChoice.page : firstPage;

  const [folded, setFolded] = useState(() => savedFold(FOLD_KEY));
  const onFold = (on: boolean) => {
    setFolded(on);
    saveFold(FOLD_KEY, on);
  };

  // The paper hides, for more room for the exercises (after the checks the
  // teacher may not need it): its × hides it, and "Lucrarea" in the bar
  // hides it or shows it again, as does "Arată pe lucrare". After the ×, the
  // focus goes to "Lucrarea", as the × goes.
  const [photoFolded, setPhotoFolded] = useState(() => savedFold(PHOTO_FOLD_KEY));
  const photoToggle = useRef<HTMLButtonElement>(null);
  const photoMoved = useRef(false);
  const onPhotoFold = (on: boolean, moveFocus = false) => {
    photoMoved.current = moveFocus;
    setPhotoFolded(on);
    saveFold(PHOTO_FOLD_KEY, on);
  };
  useEffect(() => {
    if (!photoMoved.current) return;
    photoMoved.current = false;
    photoToggle.current?.focus({ preventScroll: true });
  }, [photoFolded]);

  // After a decision, the point that opens takes the focus on its heading,
  // without a scroll, once its paper shows; a move of the teacher's own is a
  // new address, without it. Each address gives the focus once.
  const main = useRef<HTMLDivElement>(null);
  const nextStudentButton = useRef<HTMLButtonElement>(null);
  const exercisesHeading = useRef<HTMLHeadingElement>(null);
  const focused = useRef<string | null>(null);
  const focusTarget = focusTargetOf(location.state);
  useEffect(() => {
    if (focusTarget === null || focused.current === location.key) return;
    const target =
      focusTarget === 'point'
        ? submission?.id === submissionId
          ? main.current?.querySelector<HTMLElement>('.decision-slot.is-current .point-decision h2')
          : null
        : // With no student after this one, the exercises take it.
          (nextStudentButton.current ?? exercisesHeading.current);
    if (!target) return;
    focused.current = location.key;
    target.focus({ preventScroll: true });
  });

  const pathOf = (target: PaperSpot, toMode: PaperMode = mode) => paperPath(code, place, target, toMode);
  const go = (target: PaperSpot | null, toMode: PaperMode = mode, focus: FocusTarget | null = null) => {
    if (target === null) return;
    navigate(pathOf(target, toMode), { replace: true, state: focus === null ? null : { paperFocus: focus } });
  };
  const goPoint = (entry: QueuedPoint | null) => go(entry && { submissionId: entry.submissionId, key: pointKey(entry.point) });

  const refreshLists = async () => {
    void queryClient.invalidateQueries({ queryKey: ['tests'] });
    await queryClient.invalidateQueries({ queryKey: ['test', code] });
  };
  const saved = async (changed: SubmissionDetail) => {
    queryClient.setQueryData(['submission', changed.id], changed);
    await refreshLists();
  };

  // A decision on its way, known at once: `decide.isPending` changes only
  // with the next render, after a second press in the same moment.
  const deciding = useRef(false);
  const decide = useMutation({
    mutationFn: ({ submission: on, view, change }: Decision) => {
      const gradedAt = on.evaluation!.gradedAt;
      return view.kind === 'pages'
        ? api.reviewPages(on.id, { pagesReviewed: true, gradedAt })
        : api.correctItem(on.id, view.item.id, { ...change, reviewed: true, gradedAt });
    },
    onSuccess: (changed, { point }) => {
      queryClient.setQueryData(['submission', changed.id], changed);
      // The point leaves the list at once; the API is read again after.
      if (point) queryClient.setQueryData<TestDetail>(['test', code], (old) => old && withoutPoint(old, changed, point));
      void queryClient.invalidateQueries({ queryKey: ['tests'] });
      void queryClient.invalidateQueries({ queryKey: ['test', code] });
    },
    // A paper graded again in the meantime refuses the change: read it again.
    onError: (_error, { submission: on }) => {
      void queryClient.invalidateQueries({ queryKey: ['submission', on.id] });
      void queryClient.invalidateQueries({ queryKey: ['test', code] });
    },
    onSettled: () => {
      deciding.current = false;
    },
  });
  const failed = decide.variables;
  const decideError =
    decide.isError && failed && failed.submission.id === submissionId && (failed.view.kind === 'pages' ? key === 'pagini' : String(failed.view.item.id) === key)
      ? decide.error
      : null;

  // While only the points to check show, the next point opens, also on the
  // next student; with all the exercises, the next point of this student, and
  // when none is left the row stays open and "Elevul următor" takes the focus.
  const onDecide = (change: ItemChange) => {
    if (!submission || decisionView === null || decide.isPending || deciding.current) return;
    deciding.current = true;
    const from = spot;
    const fromMode = mode;
    const next = stepPoint(walked, spot, 1);
    const point = row?.reviewPoints.find((other) => pointKey(other) === key) ?? null;
    decide.mutate(
      { submission, view: decisionView, point, change },
      {
        // The next point opens only if the teacher is still at this one, in
        // the same view: not after she opened another paper or switched the
        // view, and not after she left the page (this call's own callbacks do
        // not run once the page is gone).
        onSuccess: (changed) => {
          const now = shown.current;
          if (now.spot.submissionId !== from.submissionId || now.spot.key !== from.key || now.mode !== fromMode) return;
          if (next) go({ submissionId: next.submissionId, key: pointKey(next.point) }, fromMode, 'point');
          else if (fromMode === 'verificare') go({ submissionId: changed.id, key: null });
          else go(from, fromMode, 'student');
        },
      },
    );
  };
  const nextPoint = stepPoint(walked, spot, 1);
  const previousPoint = stepPoint(walked, spot, -1);
  const pointAt = walked.findIndex((entry) => isSpotOf(entry, spot));

  const students = listedPapers(uploads, mode);
  const at = students.findIndex((other) => other.submissionId === submissionId);
  const previousStudent = at > 0 ? students[at - 1] : undefined;
  const nextStudent = at >= 0 ? students[at + 1] : undefined;

  // The papers the teacher can move to next are read ahead: the next or the
  // previous student, and the paper of the next point. Then the page of
  // another student shows at once, without a moment with no paper.
  const ahead = [nextStudent?.submissionId, previousStudent?.submissionId, nextPoint?.submissionId]
    .filter((id): id is number => id != null && id !== submissionId)
    .filter((id, index, ids) => ids.indexOf(id) === index)
    .join(',');
  useEffect(() => {
    if (ahead === '') return;
    for (const id of ahead.split(',').map(Number)) {
      void queryClient.prefetchQuery({ queryKey: ['submission', id], queryFn: () => api.getSubmission(id), staleTime: 30_000 });
    }
  }, [ahead, api, queryClient]);

  // A, J, K and 1–9, while the cursor is not in a field or in what opened from
  // the bars, and no decision is on its way. A key held down acts once: its
  // repeats would accept points the teacher never saw.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || !isReviewKey(event)) return;
      // While a decision is on its way, no key acts: the next point opens after it.
      if (decide.isPending) return;
      const pressed = event.key.toLowerCase();
      // A presses "Accept": the robot's points.
      if (pressed === 'a' && decisionView !== null) main.current?.querySelector<HTMLButtonElement>('.decision-slot.is-current [data-confirm]')?.click();
      else if (pressed === 'j') goPoint(stepPoint(walked, spot, 1));
      else if (pressed === 'k') goPoint(stepPoint(walked, spot, -1));
      else if (/^[1-9]$/.test(pressed) && !photoFolded && submission && Number(pressed) <= submission.files.length) setPageChoice({ view: viewKey, page: Number(pressed) - 1 });
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // The address names a paper of another test.
  if (submission !== undefined && submission.testCode !== code) return <NotFoundPage />;

  // The decision of the open row acts; a kept row's waits, out of reach.
  const decisionFor = (at: string): ReactNode => {
    const view = viewOf(at);
    if (view === null || !evaluation) return null;
    const current = at === key;
    return (
      <PointDecision
        evaluation={evaluation}
        view={view}
        pending={current && decide.isPending}
        error={current ? decideError : null}
        onDecide={current ? onDecide : () => undefined}
      />
    );
  };
  const showsDecision = decisionView !== null && evaluation !== null;

  return (
    <section className={place === 'try' ? 'paper-page is-try' : 'paper-page'}>
      {place === 'app' ? (
        <Crumbs
          items={[
            { label: 'Teste', to: '/' },
            { label: displayClassName(test.className), to: `/clase/${test.classId}` },
            { label: test.title, to: `/teste/${code}` },
            { label: submission?.studentName ?? row?.studentName ?? 'Lucrarea' },
          ]}
        />
      ) : (
        <div className="review-head">
          <div>
            <h1>Verificare</h1>
            <p className="test-sub">
              {test.title}
              {submission && ` · ${submission.studentName}`}
            </p>
          </div>
          <Link className="button-quiet" to={`/teste/${code}${stageHash('Verificare')}`}>
            Înapoi la test
          </Link>
        </div>
      )}
      {refreshError && <ErrorMessage error={refreshError} />}
      {paper.isRefetchError && <ErrorMessage error={paper.error} />}
      {place === 'app' && submission !== undefined && <PaperHead submission={submission} actions={actions} />}
      <div className="paper-bar">
        <div className="paper-switch" role="group" aria-label="Exercițiile arătate">
          <button type="button" aria-pressed={mode === 'toate'} onClick={() => go(spot, 'toate')}>
            Toate exercițiile
          </button>
          <button type="button" aria-pressed={mode === 'verificare'} onClick={() => go(spot, 'verificare')}>
            Doar de verificat ({queue.length})
          </button>
        </div>
        {/* The keys, between the switch and the moves, only while a decision
            shows and only when the whole line fits there: it never takes a
            line of its own. */}
        {showsDecision && (
          <p className="review-keys hint">
            <span className="review-keys-line">
              <span>
                <kbd>A</kbd> accept
              </span>
              <span>
                <kbd>J</kbd> <kbd>K</kbd> punctul următor sau anterior
              </span>
              {pageCount > 1 && !photoFolded && (
                <span>
                  <kbd>1</kbd>–<kbd>{Math.min(9, pageCount)}</kbd> pagina
                </span>
              )}
            </span>
          </p>
        )}
        {/* The moves, small: "‹ Punct 3/47 ›" (only the points to check),
            "‹ Elev ›" and "Lucrarea", on one row also on a phone. */}
        <div className="review-actions">
          {mode === 'verificare' && walked.length > 0 && (
            <span className="move-group" role="group" aria-label="Punctele de verificat">
              <button
                type="button"
                className="move-arrow"
                aria-label="Punctul anterior"
                title="Punctul anterior (K)"
                disabled={decide.isPending || previousPoint === null}
                onClick={() => goPoint(previousPoint)}
              >
                <Chevron back />
              </button>
              {/* On a very small phone only the numbers stay. */}
              <span className="move-label">
                <span className="move-word">{pointAt >= 0 ? 'Punct ' : 'Puncte: '}</span>
                {pointAt >= 0 ? `${pointAt + 1}/${walked.length}` : walked.length}
              </span>
              <button
                type="button"
                className="move-arrow is-main"
                aria-label="Următorul punct"
                title="Următorul punct (J)"
                disabled={decide.isPending || nextPoint === null}
                onClick={() => goPoint(nextPoint)}
              >
                <Chevron />
              </button>
            </span>
          )}
          {place === 'app' && students.length > 1 && (
            <span className="move-group" role="group" aria-label="Elevii">
              <button
                type="button"
                className="move-arrow"
                aria-label="Elevul anterior"
                title="Elevul anterior"
                disabled={!previousStudent}
                onClick={() => previousStudent && go(studentSpot(previousStudent, mode))}
              >
                <Chevron back />
              </button>
              <span className="move-label">Elev</span>
              <button
                ref={nextStudent ? nextStudentButton : undefined}
                type="button"
                className="move-arrow"
                aria-label="Elevul următor"
                title="Elevul următor"
                disabled={!nextStudent}
                onClick={() => nextStudent && go(studentSpot(nextStudent, mode))}
              >
                <Chevron />
              </button>
            </span>
          )}
          {submission !== undefined && (
            <button
              ref={photoToggle}
              type="button"
              className="button-quiet icon-button photo-toggle"
              aria-label="Lucrarea"
              aria-pressed={!photoFolded}
              title={photoFolded ? 'Arată lucrarea' : 'Ascunde lucrarea'}
              onClick={() => onPhotoFold(!photoFolded)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <rect x="3.5" y="4.5" width="17" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
                <circle cx="9" cy="10" r="1.75" fill="currentColor" />
                <path d="M4.5 17.5l5-5 3.5 3.5 2.5-2.5 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {mode === 'verificare' && queue.length === 0 && (
        <p className="review-done" role="status">
          Toate punctele sunt verificate. <Link to={`/teste/${code}${stageHash('Rezultate')}`}>Mergi la Rezultate</Link>
        </p>
      )}
      <div
        className={['paper-panes', place === 'try' ? 'is-single' : folded ? 'is-folded' : '', photoFolded ? 'is-photo-folded' : ''].filter(Boolean).join(' ')}
      >
        {place === 'app' && (
          <StudentList uploads={uploads} testStatus={test.status} mode={mode} current={submissionId} folded={folded} onFold={onFold} pathOf={(other) => pathOf(studentSpot(other, mode))} />
        )}
        <div className="paper-main" ref={main}>
          <h2 className="sr-only" ref={exercisesHeading} tabIndex={-1}>
            Exercițiile
          </h2>
          {submission === undefined ? (
            paper.isError ? (
              <ErrorMessage error={paper.error} />
            ) : (
              <p className="hint paper-loading">Se încarcă lucrarea…</p>
            )
          ) : evaluation ? (
            <GradedResult
              submissionId={submission.id}
              evaluation={evaluation}
              onSaved={saved}
              check={{
                openKey: key,
                keptKeys,
                // A click on the open row closes it; on another, opens it and
                // keeps this one open. "Arată pe lucrare" shows a folded paper.
                onOpen: (open, how) => {
                  // "Arată pe lucrare" shows a folded paper; the row stays
                  // open when it already was.
                  if (how === 'toPaper' && photoFolded) {
                    onPhotoFold(false);
                    if (open === key) return;
                  }
                  if (open === key) {
                    go({ submissionId, key: null });
                    return;
                  }
                  navigate(pathOf({ submissionId, key: open }), { replace: true, state: { paperKeep: true } });
                },
                onlyToCheck: mode === 'verificare',
                decisionFor,
              }}
            />
          ) : submission.status === 'failed' ? (
            <div className="warning">
              <p>Corectarea a eșuat. {submission.lastError}</p>
              {place === 'app' && (
                <button
                  type="button"
                  className="button-quiet button-small"
                  disabled={actions.retry.isPending}
                  onClick={() => actions.retry.mutate(submission.startedAt)}
                >
                  Reîncearcă
                </button>
              )}
              {actions.retry.error && <ErrorMessage error={actions.retry.error} />}
            </div>
          ) : (
            <p className="hint">{waitingText(submission, heldBackHint(me.data))}</p>
          )}
        </div>
        {submission !== undefined && !photoFolded && (
          <ReviewPhoto
            submission={submission}
            page={shownPage}
            onPage={(index) => setPageChoice({ view: viewKey, page: index })}
            focus={focus}
            frames={frames}
            onFrames={onFrames}
            onHide={() => onPhotoFold(true, true)}
          />
        )}
      </div>
    </section>
  );
}

// The arrow of a move: back (‹) or on (›).
function Chevron({ back = false }: { back?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={back ? 'M14.5 6l-6 6 6 6' : 'M9.5 6l6 6-6 6'} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
