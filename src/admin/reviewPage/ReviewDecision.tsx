import { useId, useState, type Ref } from 'react';
import { Link } from 'react-router';
import type { EvaluationInfo, EvaluationItemInfo, ItemChange, SubmissionDetail } from '../../../shared/api.ts';
import { formatPoints, gradeOf, isValidCorrection, round2 } from '../../../shared/scoring.ts';
import { pageLabel, parsePoints } from '../../ui/format.ts';
import { MathText } from '../../ui/MathText.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { waitingText } from '../submissionPage/waitingText.ts';
import { pointsText, reviewPath } from './points.ts';

// What the right pane shows: an exercise to check, the pages the robot could
// not read, or the paper with no point open.
export type ReviewView = { kind: 'item'; item: EvaluationItemInfo } | { kind: 'pages'; pages: string[] } | { kind: 'paper' };

// − and + move the points by half a point; any value in steps of 0,05 can be
// typed. Their names say the step: the bar's phone menu is "Mai mult".
const STEP = 0.5;

// Why a paper of the review has no result now. A paper being graded again
// comes back with its new result.
function noResultText(submission: SubmissionDetail): string {
  if (submission.status === 'failed') return 'Corectarea a eșuat. O poți reîncerca din pagina lucrării.';
  return `${waitingText(submission)} Când are rezultatul, apare aici.`;
}

// The right pane of the review (redesign spec §7). `onDecide` accepts the
// point with a change of points, or none. Its heading can take the focus
// (`paneRef`), for the point that opens after a decision.
export function ReviewDecision({
  code,
  submission,
  view,
  pending,
  error,
  onDecide,
  paneRef,
}: {
  code: string;
  submission: SubmissionDetail;
  view: ReviewView;
  pending: boolean;
  error: Error | null;
  onDecide: (change: ItemChange) => void;
  paneRef?: Ref<HTMLElement>;
}) {
  const evaluation = submission.status === 'graded' ? submission.evaluation : null;
  return (
    <section className="review-decision" aria-label="Decizia" ref={paneRef}>
      {evaluation === null ? (
        <>
          <h2 tabIndex={-1}>{submission.studentName}</h2>
          <p className="hint">{noResultText(submission)}</p>
        </>
      ) : view.kind === 'item' ? (
        // A new grading of the paper starts the stepper again: a value typed
        // on the old one is not for it.
        <ItemPoint key={`${evaluation.gradedAt}:${view.item.id}`} submission={submission} evaluation={evaluation} item={view.item} pending={pending} onDecide={onDecide} />
      ) : view.kind === 'pages' ? (
        <>
          <h2 tabIndex={-1}>{submission.studentName} · Paginile necitite</h2>
          <div className="review-doubt">
            <p>Robotul nu a putut citi: {view.pages.map(pageLabel).join(', ')}. Verifică pozele și punctajele exercițiilor de pe ele.</p>
            <div className="review-decide">
              <button type="button" className="button" disabled={pending} onClick={() => onDecide({})}>
                Am verificat paginile
              </button>
            </div>
          </div>
          <Total evaluation={evaluation} />
        </>
      ) : (
        <>
          <h2 tabIndex={-1}>{submission.studentName}</h2>
          <Total evaluation={evaluation} />
        </>
      )}
      {error && <ErrorMessage error={error} />}
      {evaluation !== null && view.kind !== 'paper' && (
        <p className="review-keys hint">
          <span>
            <kbd>A</kbd> accept
          </span>
          <span>
            <kbd>J</kbd> <kbd>K</kbd> punctul următor sau anterior
          </span>
          {submission.files.length > 1 && (
            <span>
              <kbd>1</kbd>–<kbd>{Math.min(9, submission.files.length)}</kbd> pagina
            </span>
          )}
        </p>
      )}
      {evaluation === null ? (
        <p>
          <Link to={`/teste/${code}/elevi/${submission.id}`}>Deschide lucrarea</Link>
        </p>
      ) : (
        <Exercises code={code} submissionId={submission.id} items={evaluation.items} current={view.kind === 'item' ? view.item.id : null} />
      )}
    </section>
  );
}

// One exercise to check: "Accept", or another value with the stepper and "Salvează".
function ItemPoint({
  submission,
  evaluation,
  item,
  pending,
  onDecide,
}: {
  submission: SubmissionDetail;
  evaluation: EvaluationInfo;
  item: EvaluationItemInfo;
  pending: boolean;
  onDecide: (change: ItemChange) => void;
}) {
  const id = useId();
  const [value, setValue] = useState(formatPoints(item.points));
  const [problem, setProblem] = useState<string | null>(null);
  const typed = parsePoints(value);
  const valid = typed !== null && isValidCorrection(typed, item.maxPoints);
  const other = valid && typed !== item.points ? typed : null;

  const move = (delta: number) => {
    const from = typed ?? item.points;
    setValue(formatPoints(round2(Math.min(item.maxPoints, Math.max(0, from + delta)))));
    setProblem(null);
  };
  const save = () => {
    if (!valid) {
      setProblem(`Punctajul este între 0 și ${formatPoints(item.maxPoints)}, din 0,05 în 0,05.`);
      return;
    }
    setProblem(null);
    onDecide(typed === item.points ? {} : { points: typed });
  };

  return (
    <>
      <div className="review-item-head">
        <h2 tabIndex={-1}>
          {submission.studentName} · {item.label}
        </h2>
        <span className="hint">{pointsText(item.maxPoints)} în barem</span>
      </div>
      <div className="review-doubt">
        <p className="review-item-points">
          <strong>{pointsText(item.points)}</strong> din {pointsText(item.maxPoints)}
        </p>
        <p>
          <span className="hint">Răspunsul elevului: </span>
          <MathText text={item.studentAnswer} />
        </p>
        <p>
          <span className="hint">Comentariul: </span>
          <MathText text={item.comment} />
        </p>
        <p className="review-why">
          De verificat: <MathText text={item.reviewReason} />
        </p>
        <div className="review-decide">
          <button type="button" className="button" disabled={pending} onClick={() => onDecide({})}>
            Accept {pointsText(item.points)}
          </button>
          <span className="stepper" role="group" aria-label="Alt punctaj">
            <button type="button" className="button-quiet" aria-label={`Scade ${pointsText(STEP)}`} disabled={pending} onClick={() => move(-STEP)}>
              −
            </button>
            <label className="sr-only" htmlFor={id}>
              Alt punctaj, din {formatPoints(item.maxPoints)}
            </label>
            <input
              id={id}
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setProblem(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !pending) save();
              }}
            />
            <button type="button" className="button-quiet" aria-label={`Adaugă ${pointsText(STEP)}`} disabled={pending} onClick={() => move(STEP)}>
              +
            </button>
          </span>
          <button type="button" className="button-quiet" disabled={pending} onClick={save}>
            Salvează
          </button>
        </div>
        {problem && (
          <p className="cell-error" role="alert">
            {problem}
          </p>
        )}
      </div>
      <Total evaluation={evaluation} />
      {other !== null && (
        <p className="review-preview" role="status">
          Cu {pointsText(other)} aici, nota devine {formatPoints(gradeOf(round2(evaluation.total - item.points + other), evaluation.maxTotal))}.
        </p>
      )}
    </>
  );
}

// "Total: 75 din 100, cu 10 din oficiu", and the grade.
function Total({ evaluation }: { evaluation: EvaluationInfo }) {
  return (
    <p className="review-total">
      <span>
        Total: {formatPoints(evaluation.total)} din {formatPoints(evaluation.maxTotal)}
        {evaluation.officePoints > 0 && `, cu ${formatPoints(evaluation.officePoints)} din oficiu`}
      </span>
      <span>
        Nota <strong className="review-total-grade">{formatPoints(evaluation.grade)}</strong>
      </span>
    </p>
  );
}

// The paper's exercises with their points: the open one marked, the others
// to check open on a click. "Deschide lucrarea" shares their heading's row.
function Exercises({ code, submissionId, items, current }: { code: string; submissionId: number; items: EvaluationItemInfo[]; current: number | null }) {
  return (
    <>
      <div className="review-exercises-head">
        <h3>Exercițiile lucrării</h3>
        <Link to={`/teste/${code}/elevi/${submissionId}`}>Deschide lucrarea</Link>
      </div>
      <ul className="review-exercises">
        {items.map((item) => {
          const toCheck = item.needsReview && !item.reviewed;
          const text = `${item.label} · ${pointsText(item.points)} din ${pointsText(item.maxPoints)}`;
          return (
            <li key={item.id} className={item.id === current ? 'is-current' : undefined}>
              {toCheck && item.id !== current ? (
                <Link replace to={reviewPath(code, { submissionId, key: String(item.id) })}>
                  {text}
                </Link>
              ) : (
                <span aria-current={item.id === current ? 'true' : undefined}>{text}</span>
              )}
              {toCheck && <span className="tag tag-wait">de verificat</span>}
              {item.needsReview && item.reviewed && <span className="tag tag-ok">verificat</span>}
            </li>
          );
        })}
      </ul>
    </>
  );
}
