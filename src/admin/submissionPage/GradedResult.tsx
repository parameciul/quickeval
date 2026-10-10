import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { EvaluationInfo, EvaluationItemInfo, ItemChange, SubmissionDetail } from '../../../shared/api.ts';
import { TEXT_LIMITS } from '../../../shared/schemas.ts';
import { formatPoints, isValidCorrection } from '../../../shared/scoring.ts';
import { confidenceLabel, pageLabel, parsePoints } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

type Saved = (submission: SubmissionDetail) => Promise<void>;
type Correct = (itemId: number, change: ItemChange) => Promise<SubmissionDetail>;

// The graded result of an upload (spec §14.1): the grade, the pages the robot
// could not read, the points of each exercise with the items to check, and
// the robot's words to the student. Each change answers with the whole
// upload, so the total and the grade follow at once. Each change names the
// grading it was made on, so a change from an old page cannot reach a newer
// result.
export function GradedResult({ submissionId, evaluation, onSaved }: { submissionId: number; evaluation: EvaluationInfo; onSaved: Saved }) {
  const api = useApi();
  const correct: Correct = (itemId, change) => api.correctItem(submissionId, itemId, { ...change, gradedAt: evaluation.gradedAt });
  return (
    <>
      <p className="grade-line">
        Nota <strong>{formatPoints(evaluation.grade)}</strong> · {formatPoints(evaluation.total)} puncte din {formatPoints(evaluation.maxTotal)}
        {evaluation.officePoints > 0 && `, cu ${formatPoints(evaluation.officePoints)} din oficiu`}
      </p>
      {evaluation.flagCount > 0 && <p className="hint">De verificat: {evaluation.flagCount}</p>}
      <UnreadablePages submissionId={submissionId} evaluation={evaluation} onSaved={onSaved} />

      <div className="table-wrap">
        <table className="items">
          <caption className="sr-only">Punctajele pe exerciții</caption>
          <thead>
            <tr>
              <th scope="col">Exercițiul</th>
              <th scope="col">Puncte</th>
              <th scope="col">Răspunsul elevului</th>
              <th scope="col">Comentariu</th>
              <th scope="col">Siguranța robotului</th>
              <th scope="col">
                <span className="sr-only">Acțiuni</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {evaluation.items.map((item) => (
              <ItemRow key={item.id} item={item} correct={correct} onSaved={onSaved} />
            ))}
          </tbody>
        </table>
      </div>

      <h3>Rezumat</h3>
      <p>{evaluation.summary}</p>
      {evaluation.strengths.length > 0 && (
        <>
          <h3>Ce a lucrat bine</h3>
          <ul>
            {evaluation.strengths.map((text, index) => (
              <li key={index}>{text}</li>
            ))}
          </ul>
        </>
      )}
      {evaluation.recommendations.length > 0 && (
        <>
          <h3>Recomandări</h3>
          <ul>
            {evaluation.recommendations.map((text, index) => (
              <li key={index}>{text}</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

// Pages that the robot could not read count as one item to check, until the
// teacher has looked at them.
function UnreadablePages({ submissionId, evaluation, onSaved }: { submissionId: number; evaluation: EvaluationInfo; onSaved: Saved }) {
  const api = useApi();
  const review = useMutation({
    mutationFn: () => api.reviewPages(submissionId, { pagesReviewed: true, gradedAt: evaluation.gradedAt }),
    onSuccess: onSaved,
  });
  if (evaluation.unreadable.length === 0) return null;
  const pages = evaluation.unreadable.map(pageLabel).join(', ');
  if (evaluation.pagesReviewed) return <p className="hint">Robotul nu a putut citi: {pages}. Ai verificat aceste pagini.</p>;
  return (
    <div className="warning">
      <p>Robotul nu a putut citi: {pages}. Verifică pozele și punctajele exercițiilor de pe ele.</p>
      <button type="button" className="button-quiet button-small" disabled={review.isPending} onClick={() => review.mutate()}>
        Am verificat paginile
      </button>
      {review.error && <ErrorMessage error={review.error} />}
    </div>
  );
}

function ItemRow({ item, correct, onSaved }: { item: EvaluationItemInfo; correct: Correct; onSaved: Saved }) {
  const [editing, setEditing] = useState(false);
  const check = useMutation({ mutationFn: () => correct(item.id, { reviewed: true }), onSuccess: onSaved });
  const toCheck = item.needsReview && !item.reviewed;

  return (
    <>
      <tr className={toCheck ? 'is-flagged' : undefined}>
        <th scope="row">{item.label}</th>
        <td>
          {formatPoints(item.points)} din {formatPoints(item.maxPoints)}
          {item.points !== item.aiPoints && <span className="hint item-note">Robotul: {formatPoints(item.aiPoints)}</span>}
        </td>
        <td>{item.studentAnswer}</td>
        <td>
          {item.comment}
          {item.needsReview && (
            <span className="item-note review-reason">{item.reviewed ? 'Verificat' : `De verificat: ${item.reviewReason}`}</span>
          )}
        </td>
        <td>{confidenceLabel(item.confidence)}</td>
        <td>
          <span className="row-actions">
            {toCheck && (
              <button
                type="button"
                className="button-quiet button-small"
                aria-label={`Verificat ${item.label}`}
                disabled={check.isPending}
                onClick={() => check.mutate()}
              >
                Verificat
              </button>
            )}
            <button
              type="button"
              className="button-quiet button-small"
              aria-label={`Modifică ${item.label}`}
              aria-expanded={editing}
              onClick={() => setEditing(!editing)}
            >
              Modifică
            </button>
          </span>
          {check.error && <ErrorMessage error={check.error} />}
        </td>
      </tr>
      {editing && (
        <tr className="edit-row">
          <td colSpan={6}>
            <ItemForm
              item={item}
              correct={correct}
              onCancel={() => setEditing(false)}
              onDone={async (submission) => {
                setEditing(false);
                await onSaved(submission);
              }}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// New points or a new comment for one item. Saving an item that waits for a
// check also checks it: the teacher has looked at it.
function ItemForm({
  item,
  correct,
  onCancel,
  onDone,
}: {
  item: EvaluationItemInfo;
  correct: Correct;
  onCancel: () => void;
  onDone: Saved;
}) {
  const [points, setPoints] = useState(formatPoints(item.points));
  const [comment, setComment] = useState(item.comment);
  const [problem, setProblem] = useState<string | null>(null);
  const save = useMutation({ mutationFn: (change: ItemChange) => correct(item.id, change), onSuccess: onDone });
  const id = `item-${item.id}`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    // Points the teacher did not change are not checked: the robot's points
    // can be off the 0,05 steps.
    const changed = points !== formatPoints(item.points);
    const value = changed ? parsePoints(points) : item.points;
    if (value === null || (changed && !isValidCorrection(value, item.maxPoints))) {
      setProblem(`Punctajul este între 0 și ${formatPoints(item.maxPoints)}, din 0,05 în 0,05.`);
      return;
    }
    setProblem(null);
    const change: ItemChange = {};
    if (value !== item.points) change.points = value;
    if (comment.trim() !== item.comment) change.comment = comment.trim();
    if (item.needsReview && !item.reviewed) change.reviewed = true;
    if (Object.keys(change).length === 0) onCancel();
    else save.mutate(change);
  };

  return (
    <form className="form-stack" onSubmit={submit}>
      <label htmlFor={`${id}-points`}>Puncte pentru {item.label} (din {formatPoints(item.maxPoints)})</label>
      <input
        id={`${id}-points`}
        type="text"
        inputMode="decimal"
        className="points-input"
        value={points}
        onChange={(event) => setPoints(event.target.value)}
        required
      />
      <label htmlFor={`${id}-comment`}>Comentariul pentru elev</label>
      <textarea
        id={`${id}-comment`}
        rows={3}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        maxLength={TEXT_LIMITS.comment}
      />
      {problem && (
        <p className="alert" role="alert">
          {problem}
        </p>
      )}
      <div className="form-row">
        <button className="button button-small" type="submit" disabled={save.isPending}>
          Salvează
        </button>
        <button type="button" className="button-quiet button-small" onClick={onCancel}>
          Renunță
        </button>
      </div>
      {save.error && <ErrorMessage error={save.error} />}
    </form>
  );
}
