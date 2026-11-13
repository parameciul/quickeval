import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import type { ReviewPoint, TestDetail } from '../../shared/api.ts';
import { formatPoints } from '../../shared/scoring.ts';
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import { paperPath } from '../admin/paperPage/paths.ts';
import { pointKey, reviewPath } from '../admin/reviewPage/points.ts';
import { StudentResult } from '../upload/StudentResult.tsx';
import { countLabel, pageLabel } from '../ui/format.ts';
import { MathText } from '../ui/MathText.tsx';
import { onTabKeyDown } from '../ui/tabKeys.ts';
import { pageFileUrl, type TryApi } from './api.ts';
import { paperOf, scoreOf } from './phase.ts';

type View = 'verificare' | 'elev';
// Each view's name, and the short one a phone shows.
const VIEWS: { id: View; label: string; short: string | null }[] = [
  { id: 'verificare', label: 'Verificare', short: null },
  { id: 'elev', label: 'Rezultatul elevului', short: 'Elev' },
];
const VIEW_IDS = VIEWS.map((view) => view.id);

// The review's own links back (#verificare, #rezultate) open the view they
// name: the results are the student's.
function viewOfHash(hash: string): View {
  return hash === '#rezultate' ? 'elev' : 'verificare';
}

// The graded paper (spec §3.3, state 4): its grade and the points to check,
// then two views: the points to check (each opens the app's own paper page,
// which also shows all the exercises with their corrections), and the page
// the student would see. The tabs stay at the top while she scrolls.
export function Graded({ detail, token, tryApi }: { detail: TestDetail; token: string; tryApi: TryApi }) {
  const [view, setView] = useState<View>(viewOfHash(useLocation().hash));
  const paper = paperOf(detail)!;
  return (
    <>
      <Summary detail={detail} />
      <div className="try-tabs" role="tablist" aria-label="Lucrarea corectată" onKeyDown={(event) => onTabKeyDown(event, VIEW_IDS, view, setView, (id) => `try-tab-${id}`)}>
        {VIEWS.map(({ id, label, short }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`try-tab-${id}`}
            aria-selected={view === id}
            tabIndex={view === id ? 0 : -1}
            aria-controls={`try-panel-${id}`}
            aria-describedby={id === 'verificare' && paper.flagCount > 0 ? 'try-tab-flags' : undefined}
            className="try-tab"
            onClick={() => setView(id)}
          >
            {short ? (
              <>
                <span className="try-tab-full">{label}</span>
                <span className="try-tab-short" aria-hidden="true">
                  {short}
                </span>
              </>
            ) : (
              label
            )}
            {id === 'verificare' && paper.flagCount > 0 && (
              <>
                <span className="try-tab-count" aria-hidden="true">
                  {paper.flagCount}
                </span>
                <span id="try-tab-flags" hidden>
                  {countLabel(paper.flagCount, 'punct de verificat', 'puncte de verificat')}
                </span>
              </>
            )}
          </button>
        ))}
      </div>
      <div className="try-panel" role="tabpanel" id={`try-panel-${view}`} aria-labelledby={`try-tab-${view}`}>
        {view === 'verificare' && <Checking code={detail.test.code} submissionId={paper.submissionId!} points={paper.reviewPoints} />}
        {view === 'elev' && <StudentView token={token} tryApi={tryApi} />}
      </div>
    </>
  );
}

// The grade, and what waits for her: the points the robot was not sure of
// (orange: hers to do), or nothing (green).
function Summary({ detail }: { detail: TestDetail }) {
  const paper = paperOf(detail)!;
  const score = scoreOf(detail);
  return (
    <section className="try-summary" aria-label="Rezultatul încercării">
      {score && (
        <div className="try-score">
          <span className="try-score-label">Nota</span>
          <span className="try-grade">{score.grade}</span>
          <span className="try-score-points">{score.points}</span>
        </div>
      )}
      {paper.flagCount > 0 ? (
        <div className="try-todo">
          <div>
            <p className="try-todo-title">{countLabel(paper.flagCount, 'punct nesigur', 'puncte nesigure')}</p>
            <p>Robotul nu a fost sigur de ele. Le verifici cu pagina lucrării alături și schimbi punctajul dacă e nevoie.</p>
          </div>
          <Link className="button" to={reviewPath(detail.test.code)}>
            Verifică {countLabel(paper.flagCount, 'punct', 'puncte')}
          </Link>
        </div>
      ) : (
        <div className="try-todo is-done">
          <div>
            <p className="try-todo-title">Toate punctele sunt verificate.</p>
            <p>Rezultatul elevului este gata.</p>
          </div>
        </div>
      )}
    </section>
  );
}

// The points to check, each with its reason; each opens the app's paper page
// at it. "Toate exercițiile" opens the page with every exercise, where she
// changes any of them and the texts for the student.
function Checking({ code, submissionId, points }: { code: string; submissionId: number; points: ReviewPoint[] }) {
  const all = (
    <p className="try-all">
      <Link className="button-quiet" to={paperPath(code, 'try', { submissionId, key: null }, 'toate')}>
        Toate exercițiile
      </Link>
    </p>
  );
  if (points.length === 0) {
    return (
      <>
        <p className="try-empty">Nu mai ai puncte de verificat. Rezultatul elevului este gata.</p>
        {all}
      </>
    );
  }
  return (
    <>
      <ul className="try-points">
        {points.map((point) => {
          const name = point.kind === 'item' ? point.label : 'Pagini greu de citit';
          return (
            <li key={pointKey(point)} className="try-point">
              <span className="try-point-name">{name}</span>
              {point.kind === 'item' ? (
                <span className="try-point-score">
                  {formatPoints(point.points)} din {formatPoints(point.maxPoints)}
                </span>
              ) : (
                <span className="try-point-score">{countLabel(point.pages.length, 'pagină', 'pagini')}</span>
              )}
              <span className="try-point-why">
                {point.kind === 'item' ? <MathText text={point.reason} /> : `Robotul nu a putut citi: ${point.pages.map(pageLabel).join(', ')}.`}
              </span>
              <Link className="button-quiet" to={reviewPath(code, { submissionId, key: pointKey(point) })} aria-label={`Verifică ${name}`}>
                Verifică
              </Link>
            </li>
          );
        })}
      </ul>
      {all}
    </>
  );
}

// Read again each time it opens: a correction of the teacher shows here too.
function StudentView({ token, tryApi }: { token: string; tryApi: TryApi }) {
  const result = useQuery({ queryKey: ['try', 'result'], queryFn: () => tryApi.result(), staleTime: 0, refetchOnMount: 'always' });
  if (result.isPending) return <p>Se încarcă…</p>;
  if (result.data === undefined) return <ErrorMessage error={result.error} />;
  return (
    <div className="try-student" data-testid="student-view">
      <p className="hint">Așa vede elevul rezultatul, pe linkul lui.</p>
      <StudentResult result={result.data} fileUrl={(fileId) => pageFileUrl(token, fileId)} />
    </div>
  );
}
