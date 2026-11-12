import { useId, useState } from 'react';
import type { EvaluationInfo, EvaluationItemInfo, ItemChange } from '../../../shared/api.ts';
import { formatPoints, gradeOf, isValidCorrection, round2 } from '../../../shared/scoring.ts';
import { pageLabel, parsePoints } from '../../ui/format.ts';
import { MathText } from '../../ui/MathText.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { pointsText } from '../reviewPage/points.ts';
import { pointChoices } from './choices.ts';

// What waits for the teacher's decision on the open row: an exercise to check,
// or the pages the robot could not read.
export type DecisionView = { kind: 'item'; item: EvaluationItemInfo } | { kind: 'pages'; pages: string[] };

// The decision on the open point to check, under its row (spec 2026-11-12
// §4.4, design C): why the robot was not sure, the points as buttons (the
// robot's chosen at first) or another value typed, and one button,
// "Confirmă", with what the grade becomes. Its heading, for screen readers,
// takes the focus after the decision before it. The A key presses
// "Confirmă" (`data-confirm`). `onDecide` takes the change of points, or none.
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
  const [chosen, setChosen] = useState(item.points);
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  // A typed value wins over the buttons. The robot's own points are valid
  // also off the 0,05 steps.
  const value = typed.trim() === '' ? chosen : parsePoints(typed);
  const valid = value !== null && (value === item.points || isValidCorrection(value, item.maxPoints));
  const other = valid && value !== item.points ? value : null;

  const confirm = () => {
    if (!valid) {
      setProblem(`Punctajul este între 0 și ${formatPoints(item.maxPoints)}, din 0,05 în 0,05.`);
      return;
    }
    setProblem(null);
    onDecide(value === item.points ? {} : { points: value });
  };

  return (
    <>
      <h2 className="sr-only" tabIndex={-1}>
        Decide: {item.label}
      </h2>
      <p className="point-why">
        <MathText text={item.reviewReason} />
      </p>
      <p className="point-label" id={`${id}-label`}>
        Punctajul <span className="hint">(robotul a dat {pointsText(item.points)} din {pointsText(item.maxPoints)})</span>
      </p>
      <div className="point-chips" role="group" aria-labelledby={`${id}-label`}>
        {pointChoices(item.maxPoints, item.points).map((choice) => (
          <button
            key={choice}
            type="button"
            className={choice === item.points ? 'point-chip is-robot' : 'point-chip'}
            aria-pressed={typed.trim() === '' && choice === chosen}
            disabled={pending}
            onClick={() => {
              setChosen(choice);
              setTyped('');
              setProblem(null);
            }}
          >
            {formatPoints(choice)}
          </button>
        ))}
      </div>
      <label className="point-other" htmlFor={id}>
        Alt punctaj<span className="sr-only">, din {formatPoints(item.maxPoints)}</span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          aria-invalid={!valid}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            setProblem(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !pending) confirm();
          }}
        />
      </label>
      <div className="point-foot">
        <button type="button" className="button" data-confirm disabled={pending} onClick={confirm}>
          {valid ? `Confirmă ${pointsText(value)}` : 'Confirmă'}
        </button>
        <span className="hint" role="status">
          {!valid
            ? ''
            : other !== null
              ? `Cu ${pointsText(other)} aici, nota devine ${formatPoints(gradeOf(round2(evaluation.total - item.points + other), evaluation.maxTotal))}.`
              : `Nota rămâne ${formatPoints(evaluation.grade)}.`}
        </span>
      </div>
      {problem && (
        <p className="cell-error" role="alert">
          {problem}
        </p>
      )}
    </>
  );
}
