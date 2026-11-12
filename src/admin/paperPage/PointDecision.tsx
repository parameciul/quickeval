import { useId, useState } from 'react';
import type { EvaluationInfo, EvaluationItemInfo, ItemChange } from '../../../shared/api.ts';
import { formatPoints, gradeOf, isValidCorrection, round2 } from '../../../shared/scoring.ts';
import { pageLabel, parsePoints } from '../../ui/format.ts';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { pointsText } from '../reviewPage/points.ts';

// − and + move the points by half a point; any value in steps of 0,05 can be
// typed. Their names say the step.
const STEP = 0.5;

// What waits for the teacher's decision on the open row: an exercise to check,
// or the pages the robot could not read.
export type DecisionView = { kind: 'item'; item: EvaluationItemInfo } | { kind: 'pages'; pages: string[] };

// The decision on the open point to check, under its row (spec 2026-11-12
// §4.4): "Accept", or another value with the stepper and "Salvează", with the
// total and what the grade becomes. Its heading takes the focus after the
// decision before it. `onDecide` takes the change of points, or none.
export function PointDecision({
  evaluation,
  view,
  pending,
  error,
  pageCount,
  onDecide,
}: {
  evaluation: EvaluationInfo;
  view: DecisionView;
  pending: boolean;
  error: Error | null;
  pageCount: number;
  onDecide: (change: ItemChange) => void;
}) {
  return (
    <section className="point-decision" aria-label="Decizia">
      {view.kind === 'item' ? (
        // A new grading of the paper starts the stepper again: a value typed
        // on the old one is not for it.
        <ItemDecision key={`${evaluation.gradedAt}:${view.item.id}`} evaluation={evaluation} item={view.item} pending={pending} onDecide={onDecide} />
      ) : (
        <>
          <h2 tabIndex={-1}>Decide: Paginile necitite</h2>
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
      )}
      {error && <ErrorMessage error={error} />}
      <p className="review-keys hint">
        <span>
          <kbd>A</kbd> accept
        </span>
        <span>
          <kbd>J</kbd> <kbd>K</kbd> punctul următor sau anterior
        </span>
        {pageCount > 1 && (
          <span>
            <kbd>1</kbd>–<kbd>{Math.min(9, pageCount)}</kbd> pagina
          </span>
        )}
      </p>
    </section>
  );
}

function ItemDecision({
  evaluation,
  item,
  pending,
  onDecide,
}: {
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
        <h2 tabIndex={-1}>Decide: {item.label}</h2>
        <span className="hint">{pointsText(item.maxPoints)} în barem</span>
      </div>
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
