import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import type { ItemChange, ReviewPoint, SubmissionDetail, TestDetail } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { parsePositiveId } from '../../../shared/ids.ts';
import { normalizeTestCode } from '../../../shared/tests.ts';
import { countLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { ReviewDecision, type ReviewView } from '../reviewPage/ReviewDecision.tsx';
import { ReviewPhoto } from '../reviewPage/ReviewPhoto.tsx';
import { ReviewQueue } from '../reviewPage/ReviewQueue.tsx';
import {
  firstSpot,
  otherPapers,
  pageIndex,
  papersToCheck,
  pointKey,
  pointQueue,
  reviewPath,
  stepPoint,
  withoutPoint,
  type QueuedPoint,
  type ReviewSpot,
} from '../reviewPage/points.ts';
import { stageHash } from '../stages.ts';
import { NotFoundPage } from './NotFoundPage.tsx';
import { refreshInterval } from './TestPage.tsx';

// /teste/:code/verificare: the review of the points to check (redesign spec
// §7). The papers and their points on the left, the page of the paper in the
// middle, the decision on the right.
export function ReviewPage() {
  const code = normalizeTestCode(useParams().code ?? '');
  if (code === null) return <NotFoundPage />;
  return <ReviewLoader key={code} code={code} />;
}

function ReviewLoader({ code }: { code: string }) {
  const api = useApi();
  const [params] = useSearchParams();
  // The test page's data: while the robot grades, new papers come in.
  const detail = useQuery({
    queryKey: ['test', code],
    queryFn: () => api.getTest(code),
    refetchInterval: (query) => refreshInterval(query.state.data?.test.status),
  });
  if (detail.isPending) return <p>Se încarcă…</p>;
  if (detail.data === undefined) return <ErrorMessage error={detail.error} />;
  // An address that names no paper of this test is first written with the
  // spot the review opens on, and only then is a paper drawn: no decision is
  // made on a spot the address does not hold, a refresh that brings a newly
  // graded paper never moves the spot, and a reload comes back to it. A paper
  // graded again keeps its address, so the page comes back to it when its
  // grading is done.
  const asked = parsePositiveId(params.get('lucrare') ?? undefined);
  // (A student who sent nothing has no paper id: no address names that row.)
  const named = asked !== null && detail.data.uploads.some((row) => row.submissionId === asked);
  const opening = named ? null : firstSpot(detail.data.uploads);
  if (opening !== null) return <Navigate replace to={reviewPath(code, opening)} />;
  return <Review code={code} detail={detail.data} refreshError={detail.isRefetchError ? detail.error : null} />;
}

interface Decision {
  submission: SubmissionDetail;
  point: ReviewPoint;
  change: ItemChange;
}

// A key typed in a field is text, not a command.
function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

// What opens over the page from the bars (a panel, the phone menu, the account
// menu) and the button of one while it is open: a key there is not for the
// review. A closed panel's button, where the focus goes back, is.
const BAR_BOXES = '.panel, .phone-menu, .user-menu, [aria-expanded="true"]';

function Review({ code, detail, refreshError }: { code: string; detail: TestDetail; refreshError: Error | null }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { test, uploads } = detail;
  const papers = papersToCheck(uploads);
  const others = otherPapers(uploads);
  const queue = pointQueue(uploads);

  // The spot the address names (the loader writes one first). A paper of this
  // test that has no result now (it is graded again) shows, with the reason.
  const asked = parsePositiveId(params.get('lucrare') ?? undefined);
  const named = asked !== null && uploads.some((other) => other.submissionId === asked);
  const spot: ReviewSpot | null = named ? { submissionId: asked, key: params.get('punct') } : firstSpot(uploads);
  const row = [...papers, ...others].find((other) => other.submissionId === spot?.submissionId);
  const point = row?.reviewPoints.find((other) => pointKey(other) === spot?.key) ?? null;
  // The spot on the screen now, for a decision that comes back later.
  const shown = useRef(spot);
  useEffect(() => {
    shown.current = spot;
  });

  const paper = useQuery({
    queryKey: ['submission', spot?.submissionId],
    queryFn: () => api.getSubmission(spot!.submissionId),
    enabled: spot !== null,
  });
  const submission = paper.data;
  const evaluation = submission?.status === 'graded' ? submission.evaluation : null;

  // The list has another grading of the paper than the one read (it was graded
  // again; the list is read every 10 s while the robot works): read the paper
  // again, so its new result shows.
  const listGradedAt = uploads.find((other) => other.submissionId === spot?.submissionId)?.gradedAt ?? null;
  const stale = submission !== undefined && listGradedAt !== (evaluation?.gradedAt ?? null);
  useEffect(() => {
    if (stale && spot !== null) void queryClient.invalidateQueries({ queryKey: ['submission', spot.submissionId] }, { cancelRefetch: false });
  }, [stale, listGradedAt, spot?.submissionId, queryClient]);

  // What the right pane shows: the point, while the paper still has it to
  // check, else the paper.
  const item = point?.kind === 'item' ? evaluation?.items.find((other) => other.id === point.itemId && other.needsReview && !other.reviewed) : undefined;
  const pagesWait = point?.kind === 'pages' && evaluation !== null && evaluation !== undefined && evaluation.unreadable.length > 0 && !evaluation.pagesReviewed;
  const view: ReviewView = item ? { kind: 'item', item } : pagesWait && evaluation ? { kind: 'pages', pages: evaluation.unreadable } : { kind: 'paper' };

  // The page of the paper: page 1, or the first page the robot could not read.
  const viewKey = `${spot?.submissionId}:${spot?.key ?? ''}`;
  const [pageChoice, setPageChoice] = useState<{ view: string; page: number } | null>(null);
  const firstPage = view.kind === 'pages' ? (pageIndex(view.pages[0] ?? '') ?? 0) : 0;
  const shownPage = pageChoice?.view === viewKey ? pageChoice.page : firstPage;

  // After a decision, the point that opens takes the focus on its heading,
  // without a scroll (on a phone the page of the paper stays in view). A move
  // of the teacher's own drops it.
  const pane = useRef<HTMLElement>(null);
  const focusOn = useRef<ReviewSpot | null>(null);
  useEffect(() => {
    const target = focusOn.current;
    if (target === null || submission?.id !== target.submissionId || spot?.submissionId !== target.submissionId || spot.key !== target.key) return;
    focusOn.current = null;
    pane.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  });

  const go = (target: { submissionId: number; key: string | null } | null) => {
    if (target === null) return;
    focusOn.current = null;
    const next = new URLSearchParams({ lucrare: String(target.submissionId) });
    if (target.key !== null) next.set('punct', target.key);
    setParams(next, { replace: true });
  };
  const goPoint = (entry: QueuedPoint | null) => go(entry && { submissionId: entry.submissionId, key: pointKey(entry.point) });

  // A decision on its way, known at once: `decide.isPending` changes only
  // with the next render, after a second press in the same moment.
  const deciding = useRef(false);
  const decide = useMutation({
    mutationFn: ({ submission: shown, point: chosen, change }: Decision) => {
      const gradedAt = shown.evaluation!.gradedAt;
      return chosen.kind === 'pages'
        ? api.reviewPages(shown.id, { pagesReviewed: true, gradedAt })
        : api.correctItem(shown.id, chosen.itemId, { ...change, reviewed: true, gradedAt });
    },
    onSuccess: (saved, { point: chosen }) => {
      queryClient.setQueryData(['submission', saved.id], saved);
      // The point leaves the list at once; the API is read again after.
      queryClient.setQueryData<TestDetail>(['test', code], (old) => old && withoutPoint(old, saved, chosen));
      void queryClient.invalidateQueries({ queryKey: ['tests'] });
      void queryClient.invalidateQueries({ queryKey: ['test', code] });
    },
    // A paper graded again in the meantime refuses the change: read it again.
    onError: (_error, { submission: shown }) => {
      void queryClient.invalidateQueries({ queryKey: ['submission', shown.id] });
      void queryClient.invalidateQueries({ queryKey: ['test', code] });
    },
    onSettled: () => {
      deciding.current = false;
    },
  });
  const failed = decide.variables;
  const decideError =
    decide.isError && failed && failed.submission.id === spot?.submissionId && pointKey(failed.point) === spot.key ? decide.error : null;

  const onDecide = (change: ItemChange) => {
    if (!point || !submission || spot === null || view.kind === 'paper' || decide.isPending || deciding.current) return;
    deciding.current = true;
    const from = spot;
    const next = stepPoint(queue, spot, 1);
    decide.mutate(
      { submission, point, change },
      {
        // The next point opens only if the teacher is still at this one: not
        // after she opened another paper, and not after she left the review
        // (this call's own callbacks do not run once the page is gone).
        onSuccess: (saved) => {
          if (shown.current?.submissionId !== from.submissionId || shown.current.key !== from.key) return;
          const target = next ? { submissionId: next.submissionId, key: pointKey(next.point) } : { submissionId: saved.id, key: null };
          go(target);
          focusOn.current = target;
        },
      },
    );
  };
  const nextPoint = stepPoint(queue, spot, 1);

  // A, J, K and 1–9, while the cursor is not in a field or in what opened from
  // the bars, and no decision is on its way. A key held down acts once: its
  // repeats would accept points the teacher never saw.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented || isTyping(event.target)) return;
      if (event.target instanceof Element && event.target.closest(BAR_BOXES)) return;
      // While a decision is on its way, no key acts: the next point opens after it.
      if (decide.isPending) return;
      const key = event.key.toLowerCase();
      if (key === 'a') onDecide({});
      else if (key === 'j') goPoint(stepPoint(queue, spot, 1));
      else if (key === 'k') goPoint(stepPoint(queue, spot, -1));
      else if (/^[1-9]$/.test(key) && submission && Number(key) <= submission.files.length) setPageChoice({ view: viewKey, page: Number(key) - 1 });
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <section className="review-page">
      <div className="review-head">
        <div>
          <h1>Verificare</h1>
          <p className="test-sub">
            {test.title} · {displayClassName(test.className)}
            {queue.length > 0 && ` · ${countLabel(queue.length, 'punct', 'puncte')} în ${countLabel(papers.length, 'lucrare', 'lucrări')}`}
          </p>
        </div>
        <div className="review-actions">
          <Link className="button-quiet" to={`/teste/${code}${stageHash('Verificare')}`}>
            Înapoi la test
          </Link>
          {nextPoint && (
            <button type="button" className="button" disabled={decide.isPending} onClick={() => goPoint(nextPoint)}>
              Următorul punct
            </button>
          )}
        </div>
      </div>
      {refreshError && <ErrorMessage error={refreshError} />}
      {spot === null ? (
        <p className="hint">Nicio lucrare nu este corectată încă.</p>
      ) : (
        <>
          {queue.length === 0 && (
            <p className="review-done" role="status">
              Toate punctele sunt verificate. <Link to={`/teste/${code}${stageHash('Rezultate')}`}>Mergi la Rezultate</Link>
            </p>
          )}
          <div className="review-panes">
            <ReviewQueue code={code} papers={papers} others={others} spot={spot} />
            {submission === undefined ? (
              <div className="review-loading">{paper.isError ? <ErrorMessage error={paper.error} /> : <p className="hint">Se încarcă lucrarea…</p>}</div>
            ) : (
              <>
                <ReviewPhoto submission={submission} page={shownPage} onPage={(index) => setPageChoice({ view: viewKey, page: index })} />
                <ReviewDecision
                  code={code}
                  submission={submission}
                  view={view}
                  pending={decide.isPending}
                  error={decideError}
                  onDecide={onDecide}
                  paneRef={pane}
                />
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
