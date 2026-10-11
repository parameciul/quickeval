import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import type { EvaluationInfo, EvaluationItemInfo, ItemChange, SubmissionDetail } from '../../../shared/api.ts';
import { TEXT_LIMITS, confidenceLevel, type Confidence } from '../../../shared/schemas.ts';
import { formatPoints, isValidCorrection } from '../../../shared/scoring.ts';
import { confidenceLabel, pageLabel, parsePoints, pointsLevel } from '../../ui/format.ts';
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
        Nota{' '}
        <strong className={`points points-${pointsLevel(evaluation.grade, 10)}`}>{formatPoints(evaluation.grade)}</strong> ·{' '}
        {formatPoints(evaluation.total)} puncte din {formatPoints(evaluation.maxTotal)}
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

      <FeedbackSections submissionId={submissionId} evaluation={evaluation} onSaved={onSaved} />
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

// The robot's confidence as 1 to 5 bars, green (5) to red (1), not as text.
// The label stays for screen readers, so older checks by text still find it.
export function ConfidenceBars({ confidence }: { confidence: Confidence }) {
  const level = confidenceLevel(confidence);
  const label = confidenceLabel(confidence);
  return (
    <span
      className={`conf-bars conf-${level}`}
      role="img"
      aria-label={`Siguranța robotului: ${label}, ${level} din 5`}
      title={`${label} (${level} din 5)`}
    >
      {[1, 2, 3, 4, 5].map((step) => (
        <span key={step} aria-hidden="true" className={step <= level ? 'conf-bar is-on' : 'conf-bar'} />
      ))}
      <span className="sr-only">{label}</span>
    </span>
  );
}

// One row of the exercises table. Modifică turns the points and the comment
// cells into inputs in the same row, so the teacher sees the exercise, the
// student's answer, and the robot's confidence while typing. Saving an item
// that waits for a check also checks it: the teacher has looked at it.
function ItemRow({ item, correct, onSaved }: { item: EvaluationItemInfo; correct: Correct; onSaved: Saved }) {
  const [editing, setEditing] = useState(false);
  const [points, setPoints] = useState(formatPoints(item.points));
  const [comment, setComment] = useState(item.comment);
  const [problem, setProblem] = useState<string | null>(null);
  const check = useMutation({ mutationFn: () => correct(item.id, { reviewed: true }), onSuccess: onSaved });
  const save = useMutation({
    mutationFn: (change: ItemChange) => correct(item.id, change),
    onSuccess: async (submission) => {
      setEditing(false);
      setProblem(null);
      await onSaved(submission);
    },
  });
  const toCheck = item.needsReview && !item.reviewed;
  const id = `item-${item.id}`;

  const startEditing = () => {
    setPoints(formatPoints(item.points));
    setComment(item.comment);
    setProblem(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setProblem(null);
  };

  const saveEditing = () => {
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
    if (Object.keys(change).length === 0) cancelEditing();
    else save.mutate(change);
  };

  return (
    <tr className={toCheck ? 'is-flagged' : undefined}>
      <th scope="row">{item.label}</th>
      <td>
        {editing ? (
          <>
            <label className="sr-only" htmlFor={`${id}-points`}>
              Puncte pentru {item.label} (din {formatPoints(item.maxPoints)})
            </label>
            <input
              id={`${id}-points`}
              type="text"
              inputMode="decimal"
              className="cell-input"
              value={points}
              onChange={(event) => setPoints(event.target.value)}
              required
            />
            {problem && (
              <p className="cell-error" role="alert">
                {problem}
              </p>
            )}
          </>
        ) : (
          <>
            <span className={`points points-${pointsLevel(item.points, item.maxPoints)}`}>
              {formatPoints(item.points)} din {formatPoints(item.maxPoints)}
            </span>
            {item.points !== item.aiPoints && <span className="hint item-note">Robotul: {formatPoints(item.aiPoints)}</span>}
          </>
        )}
      </td>
      <td>{item.studentAnswer}</td>
      <td>
        {editing ? (
          <>
            <label className="sr-only" htmlFor={`${id}-comment`}>
              Comentariul pentru elev
            </label>
            <textarea
              id={`${id}-comment`}
              rows={3}
              className="cell-area"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={TEXT_LIMITS.comment}
            />
            {item.needsReview && (
              <span className="item-note review-reason">{item.reviewed ? 'Verificat' : `De verificat: ${item.reviewReason}`}</span>
            )}
          </>
        ) : (
          <>
            {item.comment}
            {item.needsReview && (
              <span className="item-note review-reason">{item.reviewed ? 'Verificat' : `De verificat: ${item.reviewReason}`}</span>
            )}
          </>
        )}
      </td>
      <td>
        <ConfidenceBars confidence={item.confidence} />
      </td>
      <td>
        {editing ? (
          <span className="row-actions">
            <button type="button" className="button button-small" disabled={save.isPending} onClick={saveEditing}>
              Salvează
            </button>
            <button type="button" className="button-quiet button-small" onClick={cancelEditing}>
              Renunță
            </button>
          </span>
        ) : (
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
              onClick={startEditing}
            >
              Modifică
            </button>
          </span>
        )}
        {check.error && <ErrorMessage error={check.error} />}
        {save.error && <ErrorMessage error={save.error} />}
      </td>
    </tr>
  );
}

// The final words to the student, all editable in place: Rezumat, Ce a lucrat
// bine, Recomandări.
function FeedbackSections({ submissionId, evaluation, onSaved }: { submissionId: number; evaluation: EvaluationInfo; onSaved: Saved }) {
  return (
    <>
      <SummarySection submissionId={submissionId} evaluation={evaluation} onSaved={onSaved} />
      <ListSection
        submissionId={submissionId}
        evaluation={evaluation}
        onSaved={onSaved}
        field="strengths"
        title="Ce a lucrat bine"
        emptyHint="Nimic notat încă."
      />
      <ListSection
        submissionId={submissionId}
        evaluation={evaluation}
        onSaved={onSaved}
        field="recommendations"
        title="Recomandări"
        emptyHint="Nicio recomandare încă."
      />
    </>
  );
}

function SummarySection({ submissionId, evaluation, onSaved }: { submissionId: number; evaluation: EvaluationInfo; onSaved: Saved }) {
  const api = useApi();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(evaluation.summary);
  const [problem, setProblem] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (summary: string) => api.reviewPages(submissionId, { gradedAt: evaluation.gradedAt, summary }),
    onSuccess: async (submission) => {
      setEditing(false);
      setProblem(null);
      await onSaved(submission);
    },
  });

  const start = () => {
    setValue(evaluation.summary);
    setProblem(null);
    setEditing(true);
  };

  const saveNow = () => {
    const summary = value.trim();
    if (summary === '') {
      setProblem('Scrie rezumatul.');
      return;
    }
    if (summary === evaluation.summary) {
      setEditing(false);
      return;
    }
    setProblem(null);
    save.mutate(summary);
  };

  return (
    <section aria-label="Rezumat">
      <div className="feedback-head">
        <h3>Rezumat</h3>
        {!editing && (
          <button type="button" className="button-quiet button-small" aria-label="Modifică rezumatul" onClick={start}>
            Modifică
          </button>
        )}
      </div>
      {editing ? (
        <div className="feedback-edit">
          <label className="sr-only" htmlFor={`summary-${submissionId}`}>
            Rezumatul pentru elev
          </label>
          <textarea
            id={`summary-${submissionId}`}
            rows={4}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={TEXT_LIMITS.summary}
          />
          {problem && (
            <p className="alert" role="alert">
              {problem}
            </p>
          )}
          <div className="form-row">
            <button type="button" className="button button-small" disabled={save.isPending} onClick={saveNow}>
              Salvează
            </button>
            <button type="button" className="button-quiet button-small" onClick={() => setEditing(false)}>
              Renunță
            </button>
          </div>
          {save.error && <ErrorMessage error={save.error} />}
        </div>
      ) : (
        <p>{evaluation.summary}</p>
      )}
    </section>
  );
}

function ListSection({
  submissionId,
  evaluation,
  onSaved,
  field,
  title,
  emptyHint,
}: {
  submissionId: number;
  evaluation: EvaluationInfo;
  onSaved: Saved;
  field: 'strengths' | 'recommendations';
  title: string;
  emptyHint: string;
}) {
  const api = useApi();
  const current = evaluation[field];
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current.join('\n'));
  const [problem, setProblem] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (list: string[]) => api.reviewPages(submissionId, { gradedAt: evaluation.gradedAt, [field]: list }),
    onSuccess: async (submission) => {
      setEditing(false);
      setProblem(null);
      await onSaved(submission);
    },
  });

  const start = () => {
    setValue(current.join('\n'));
    setProblem(null);
    setEditing(true);
  };

  const saveNow = () => {
    const list = value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
    if (list.some((line) => Array.from(line).length > TEXT_LIMITS.listEntry)) {
      setProblem(`Fiecare punct are cel mult ${TEXT_LIMITS.listEntry} de caractere.`);
      return;
    }
    if (list.length > 5) {
      setProblem('Scrie cel mult 5 puncte, câte unul pe rând.');
      return;
    }
    if (list.join('\n') === current.join('\n')) {
      setEditing(false);
      return;
    }
    setProblem(null);
    save.mutate(list);
  };

  return (
    <section aria-label={title}>
      <div className="feedback-head">
        <h3>{title}</h3>
        {!editing && (
          <button type="button" className="button-quiet button-small" aria-label={`Modifică ${title.toLowerCase()}`} onClick={start}>
            Modifică
          </button>
        )}
      </div>
      {editing ? (
        <div className="feedback-edit">
          <label className="sr-only" htmlFor={`${field}-${submissionId}`}>
            {title}, câte unul pe rând
          </label>
          <textarea
            id={`${field}-${submissionId}`}
            rows={Math.max(2, Math.min(6, current.length + 1))}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Câte unul pe rând"
          />
          <p className="hint">Câte unul pe rând, cel mult 5.</p>
          {problem && (
            <p className="alert" role="alert">
              {problem}
            </p>
          )}
          <div className="form-row">
            <button type="button" className="button button-small" disabled={save.isPending} onClick={saveNow}>
              Salvează
            </button>
            <button type="button" className="button-quiet button-small" onClick={() => setEditing(false)}>
              Renunță
            </button>
          </div>
          {save.error && <ErrorMessage error={save.error} />}
        </div>
      ) : current.length > 0 ? (
        <ul>
          {current.map((text, index) => (
            <li key={index}>{text}</li>
          ))}
        </ul>
      ) : (
        <p className="hint">{emptyHint}</p>
      )}
    </section>
  );
}
