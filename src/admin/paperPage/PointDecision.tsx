import { useId, useState } from 'react';
import type { EvaluationInfo, EvaluationItemInfo, ItemChange } from '../../../shared/api.ts';
import { formatPoints, gradeOf, isValidCorrection, round2 } from '../../../shared/scoring.ts';
import { pageLabel, parsePoints } from '../../ui/format.ts';
import { MathText } from '../../ui/MathText.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { pointsText } from '../reviewPage/points.ts';

// What waits for the teacher's decision on the open row: an exercise to check,
// or the pages the robot could not read.
export type DecisionView = { kind: 'item'; item: EvaluationItemInfo } | { kind: 'pages'; pages: string[] };

// The decision on the open point to check, under its row (spec 2026-11-12
// §4.4): why the robot was not sure, then "Accept" with the robot's points,
// or another value with the stepper and "Salvează", and what the grade
// becomes with it. Its heading, for screen readers, takes the focus after the
// decision before it. The A key presses "Accept" (`data-confirm`). `onDecide`
// takes the change of points, or none.
export function PointDecision({
  evaluation,
  view,
  pending,
  error,
  onDecide,
}: {
  evaluation: EvaluationInfo;
  view: DecisionView;
  pending: boolean;
  error: Error | null;
  onDecide: (change: ItemChange) => void;
}) {
  return (
    <section className="point-decision" aria-label="Decizia">
      {view.kind === 'item' ? (
        // A new grading of the paper starts the choice again: a value chosen
        // on the old one is not for it.
        <ItemDecision key={`${evaluation.gradedAt}:${view.item.id}`} evaluation={evaluation} item={view.item} pending={pending} onDecide={onDecide} />
      ) : (
        <>
          <h2 className="sr-only" tabIndex={-1}>
            Decide: Paginile necitite
          </h2>
          <p className="point-why">
            Robotul nu a putut citi: {view.pages.map(pageLabel).join(', ')}. Verifică pozele și punctajele exercițiilor de pe ele.
          </p>
          <div className="point-foot">
            <button type="button" className="button" data-confirm disabled={pending} onClick={() => onDecide({})}>
              Am verificat paginile
            </button>
          </div>
        </>
      )}
      {error && <ErrorMessage error={error} />}
    </section>
  );
}

// − and + move the points by half a point, on the 0,05 steps and between 0
// and the maximum; any value in steps of 0,05 can be typed. Their names say
// the step.
const STEP = 0.5;

export function steppedPoints(from: number, delta: number, maxPoints: number): number {
  const moved = Math.round(round2(from + delta) * 20) / 20;
  return round2(Math.min(maxPoints, Math.max(0, moved)));
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
  // The robot's own points are valid also off the 0,05 steps.
  const valid = typed !== null && (typed === item.points || isValidCorrection(typed, item.maxPoints));
  const other = valid && typed !== item.points ? typed : null;

  const move = (delta: number) => {
    setValue(formatPoints(steppedPoints(typed ?? item.points, delta, item.maxPoints)));
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
      <h2 className="sr-only" tabIndex={-1}>
        Decide: {item.label}
      </h2>
      <p className="point-why">
        <MathText text={item.reviewReason} />
      </p>
      <div className="review-decide">
        <button type="button" className="button" data-confirm disabled={pending} onClick={() => onDecide({})}>
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
            aria-invalid={!valid}
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
      {other !== null && (
        <p className="review-preview" role="status">
          Cu {pointsText(other)} aici, nota devine {formatPoints(gradeOf(round2(evaluation.total - item.points + other), evaluation.maxTotal))}.
        </p>
      )}
    </>
  );
}
