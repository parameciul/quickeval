import { useMutation } from '@tanstack/react-query';
import { useState, type MouseEvent, type ReactNode } from 'react';
import type { EvaluationInfo, EvaluationItemInfo, ItemChange, SubmissionDetail } from '../../../shared/api.ts';
import { TEXT_LIMITS, confidenceLevel, type Confidence } from '../../../shared/schemas.ts';
import { formatPoints, isValidCorrection } from '../../../shared/scoring.ts';
import { confidenceLabel, pageLabel, parsePoints, pointsLevel } from '../../ui/format.ts';
import { MathText } from '../../ui/MathText.tsx';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

type Saved = (submission: SubmissionDetail) => Promise<void>;
type Correct = (itemId: number, change: ItemChange) => Promise<SubmissionDetail>;

// The paper page's hold on the rows (spec 2026-11-12 §4.4): the open row
// (an item's id, or "pagini" for the pages the robot could not read), a click
// that opens a row, only the rows to check, and the decision shown under the
// open row while it waits for a check. Without it the result is a plain list
// (the Quick Try's "Rezultatul profesorului").
export interface ItemsCheck {
  openKey: string | null;
  onOpen: (key: string) => void;
  onlyToCheck: boolean;
  decision: ReactNode;
}

// A click on a row opens it, unless it was on something of its own.
function rowClick(onOpen: (() => void) | undefined) {
  if (!onOpen) return undefined;
  return (event: MouseEvent<HTMLTableRowElement>) => {
    if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select, label')) return;
    onOpen();
  };
}

// Rows so the whole comment is visible without manual enlarging: one row
// per ~45 characters of each line (the comment column is narrow), at least
// 5 rows and at most 14. Grows while typing.
function commentRows(text: string): number {
  let rows = 0;
  for (const line of text.split('\n')) rows += Math.max(1, Math.ceil(line.length / 45));
  return Math.min(14, Math.max(5, rows + 1));
}

// The graded result of an upload (spec §14.1): the grade, the pages the robot
// could not read, the points of each exercise with the items to check, and
// the robot's words to the student. Each change answers with the whole
// upload, so the total and the grade follow at once. Each change names the
// grading it was made on, so a change from an old page cannot reach a newer
// result.
export function GradedResult({
  submissionId,
  evaluation,
  onSaved,
  check,
}: {
  submissionId: number;
  evaluation: EvaluationInfo;
  onSaved: Saved;
  check?: ItemsCheck;
}) {
  const api = useApi();
  const correct: Correct = (itemId, change) => api.correctItem(submissionId, itemId, { ...change, gradedAt: evaluation.gradedAt });
  const shown = check?.onlyToCheck
    ? evaluation.items.filter((item) => (item.needsReview && !item.reviewed) || String(item.id) === check.openKey)
    : evaluation.items;
  return (
    <div className="graded-result">
      <div className="grade-strip">
        <p className="grade-line">
          Nota{' '}
          <strong className={`points points-${pointsLevel(evaluation.grade, 10)}`}>{formatPoints(evaluation.grade)}</strong> ·{' '}
          {formatPoints(evaluation.total)} puncte din {formatPoints(evaluation.maxTotal)}
          {evaluation.officePoints > 0 && `, cu ${formatPoints(evaluation.officePoints)} din oficiu`}
        </p>
        {evaluation.flagCount > 0 ? (
          <span className="tag tag-wait">De verificat: {evaluation.flagCount}</span>
        ) : (
          <span className="tag tag-ok">Nimic de verificat</span>
        )}
      </div>
      <UnreadablePages submissionId={submissionId} evaluation={evaluation} onSaved={onSaved} check={check} />

      {shown.length === 0 ? (
        <p className="hint">Niciun exercițiu de verificat în această lucrare.</p>
      ) : (
      <div className="table-wrap">
        <table className="items">
          <caption className="sr-only">Punctajele pe exerciții</caption>
          <thead>
            <tr>
                  <th scope="col" title="Exercițiul">
                    <span className="sr-only">Exercițiul</span>
                    <span aria-hidden="true">#</span>
                  </th>
              <th scope="col">Puncte</th>
              <th scope="col">Răspunsul elevului</th>
              <th scope="col">Comentariu</th>
                  <th scope="col" className="conf-col" title="Siguranța robotului">
                    <span className="sr-only">Siguranța robotului</span>
                    <RobotMark />
                  </th>
              <th scope="col">
                <span className="sr-only">Acțiuni</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((item) => {
              const open = check !== undefined && String(item.id) === check.openKey;
              const deciding = open && item.needsReview && !item.reviewed && check.decision !== null;
              return (
                <ItemRows
                  key={item.id}
                  item={item}
                  correct={correct}
                  onSaved={onSaved}
                  open={open}
                  onOpen={check ? () => check.onOpen(String(item.id)) : undefined}
                  decision={deciding ? check.decision : null}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {!check?.onlyToCheck && <FeedbackSections submissionId={submissionId} evaluation={evaluation} onSaved={onSaved} />}
    </div>
  );
}

// Pages that the robot could not read count as one item to check, until the
// teacher has looked at them. On the paper page they open as a row does, and
// the open pages show the page's decision.
function UnreadablePages({
  submissionId,
  evaluation,
  onSaved,
  check,
}: {
  submissionId: number;
  evaluation: EvaluationInfo;
  onSaved: Saved;
  check?: ItemsCheck;
}) {
  const api = useApi();
  const review = useMutation({
    mutationFn: () => api.reviewPages(submissionId, { pagesReviewed: true, gradedAt: evaluation.gradedAt }),
    onSuccess: onSaved,
  });
  if (evaluation.unreadable.length === 0) return null;
  const pages = evaluation.unreadable.map(pageLabel).join(', ');
  if (evaluation.pagesReviewed) return check?.onlyToCheck ? null : <p className="hint">Robotul nu a putut citi: {pages}. Ai verificat aceste pagini.</p>;
  if (check) {
    // The open pages' decision says why itself.
    const open = check.openKey === 'pagini';
    return (
      <div className={open ? 'pages-check is-open' : 'pages-check'}>
        <p>
          <span className="points-pill">Pagini necitite</span> {pages}
          {!open && (
            <button
              type="button"
              className="button-quiet button-small icon-button verifica-btn"
              aria-label="Verifică paginile necitite"
              title="Verifică"
              onClick={() => check.onOpen('pagini')}
            >
              <CheckMark />
            </button>
          )}
        </p>
        {open && check.decision}
      </div>
    );
  }
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

// An exercise's row and, while it is open and waits for a check, the
// decision under it, across the whole table.
function ItemRows({
  item,
  correct,
  onSaved,
  open,
  onOpen,
  decision,
}: {
  item: EvaluationItemInfo;
  correct: Correct;
  onSaved: Saved;
  open: boolean;
  onOpen?: () => void;
  decision: ReactNode;
}) {
  return (
    <>
      <ItemRow item={item} correct={correct} onSaved={onSaved} open={open} onOpen={onOpen} />
      {decision !== null && (
        <tr className="item-decision">
          <td colSpan={6}>{decision}</td>
        </tr>
      )}
    </>
  );
}

// One row of the exercises table. Modifică turns the points and the comment
// cells into inputs in the same row, so the teacher sees the exercise, the
// student's answer, and the robot's confidence while typing. Saving an item
// that waits for a check also checks it: the teacher has looked at it. On the
// paper page a click on the row, or its "Arată pe lucrare", opens it: the
// paper shows its answer. There a row to check is calm (design C of the spec):
// its points in a soft orange label, no reason in the row and no "Verificat",
// only "Verifică", which opens it; the reason and the decision show under the
// open row.
function ItemRow({
  item,
  correct,
  onSaved,
  open = false,
  onOpen,
}: {
  item: EvaluationItemInfo;
  correct: Correct;
  onSaved: Saved;
  open?: boolean;
  onOpen?: () => void;
}) {
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
  const checked = item.needsReview && item.reviewed;
  // The paper page's rows: a row to check opens with "Verifică".
  const calm = onOpen !== undefined;
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
    <tr
      className={[toCheck ? (calm ? 'is-to-check' : 'is-flagged') : '', open ? 'is-open' : '', onOpen ? 'is-openable' : ''].filter(Boolean).join(' ') || undefined}
      onClick={rowClick(onOpen)}
    >
      <th scope="row" title={item.label}>
        {item.exerciseId} <span className="sr-only">{item.label}</span>
        {checked && <ReviewCheck />}
      </th>
      <td data-label="Puncte">
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
            {calm && toCheck ? (
              <span className="points-pill">
                {formatPoints(item.points)} din {formatPoints(item.maxPoints)}
              </span>
            ) : (
              <span className={`points points-${pointsLevel(item.points, item.maxPoints)}`}>
                {formatPoints(item.points)} din {formatPoints(item.maxPoints)}
              </span>
            )}
            {item.points !== item.aiPoints && <RobotPoints points={item.aiPoints} />}
          </>
        )}
      </td>
      <td data-label="Răspunsul elevului">
        <MathText text={item.studentAnswer} />
      </td>
      <td data-label="Comentariu">
        {editing ? (
          <>
            <label className="sr-only" htmlFor={`${id}-comment`}>
              Comentariul pentru elev
            </label>
            <textarea
              id={`${id}-comment`}
              rows={commentRows(comment)}
              className="cell-area"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={TEXT_LIMITS.comment}
            />
            {toCheck && !calm && (
              <div className="review-note">
                <p className="review-reason">
                  De verificat: <MathText text={item.reviewReason} />
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <MathText text={item.comment} />
            {/* What to check, with the button that says it was checked: the
                reason and its answer sit together. */}
            {toCheck && !calm && (
              <div className="review-note">
                <p className="review-reason">
                  De verificat: <MathText text={item.reviewReason} />
                </p>
                <button
                  type="button"
                  className="button-quiet button-small verificat-btn"
                  aria-label={`Verificat ${item.label}`}
                  disabled={check.isPending}
                  onClick={() => check.mutate()}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Verificat
                </button>
                {check.error && <ErrorMessage error={check.error} />}
              </div>
            )}
          </>
        )}
      </td>
      <td className="conf-col" data-label="Siguranța robotului">
        <ConfidenceBars confidence={item.confidence} />
      </td>
      <td className={editing ? undefined : 'item-check'}>
        {editing ? (
          <span className="row-actions">
            <button
              type="button"
              className="button button-small icon-button"
              disabled={save.isPending}
              aria-label="Salvează"
              title="Salvează"
              onClick={saveEditing}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M5 4h11l3 3v13H5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M8 4v5h7V4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M8 20v-6h8v6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              className="button-quiet button-small icon-button"
              aria-label="Renunță"
              title="Renunță"
              onClick={cancelEditing}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        ) : (
          <span className="row-actions">
            {onOpen && toCheck && !open && (
              <button
                type="button"
                className="button-quiet button-small icon-button verifica-btn"
                aria-label={`Verifică ${item.label}`}
                title="Verifică"
                onClick={onOpen}
              >
                <CheckMark />
              </button>
            )}
            {onOpen && !(toCheck && !open) && (
              <button
                type="button"
                className="button-quiet button-small icon-button"
                aria-label={`Arată pe lucrare ${item.label}`}
                aria-pressed={open}
                title="Arată pe lucrare"
                onClick={onOpen}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
              </button>
            )}
            <button
              type="button"
              className="button-quiet button-small icon-button"
              aria-label={`Modifică ${item.label}`}
              aria-expanded={editing}
              title="Modifică"
              onClick={startEditing}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  d="M4 20l1-4L16.5 4.5a2.12 2.12 0 013 3L8 19l-4 1z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <path d="M14.5 6.5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        )}
        {save.error && <ErrorMessage error={save.error} />}
      </td>
    </tr>
  );
}

// "Verifică" on the paper page: a magnifier with a check in it, drawn like the
// row's other icon buttons, in orange (the colour of what waits on the
// teacher). Its name and its tooltip keep the word.
function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M15.3 15.3L20 20" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M7.6 10.7l2 2 3.6-3.9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// The robot's points before the teacher corrected them: the old value in
// gray next to a robot mark, so the history needs no words. The hidden words
// say what the picture means for screen readers, and the title says it for
// a sighted teacher on hover.
function RobotPoints({ points }: { points: number }) {
  const meaning = 'Punctajul robotului înainte de corectura ta';
  return (
    <span className="hint item-note ai-points" title={meaning}>
      <span className="sr-only">{`${meaning}: `}</span>
      <span className="ai-value">{formatPoints(points)}</span>
      <RobotMark />
    </span>
  );
}

// The robot mark used wherever the robot is the subject: the old-points note
// and the confidence column header. One picture, one meaning: a friendly
// robot's head in its own colours (lilac head, dark visor with blue eyes,
// yellow cap, pink antennas), the same on a light and a dark page.
function RobotMark() {
  return (
    <svg className="robot-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M2 3.2V10M22 3.2V10" stroke="#e8558f" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="2" cy="2.2" r="1.6" fill="#ff4f73" />
      <circle cx="22" cy="2.2" r="1.6" fill="#ff4f73" />
      <rect x="0.6" y="9" width="2.8" height="8" rx="1.4" fill="#e9568a" />
      <rect x="20.6" y="9" width="2.8" height="8" rx="1.4" fill="#ff3f97" />
      <path d="M7.5 5.2C7.8 2.6 9.6 1.6 12 1.6s4.2 1 4.5 3.6z" fill="#f2b62c" />
      <rect x="2.8" y="4.4" width="18.4" height="18" rx="5" fill="#d8c8e8" />
      <path d="M2.8 17.2h18.4v0.2a5 5 0 0 1-5 5H7.8a5 5 0 0 1-5-5z" fill="#c4a6dc" />
      <rect x="4.4" y="7.4" width="15.2" height="6.6" rx="2.2" fill="#342a52" />
      <rect x="6.6" y="8.9" width="1.9" height="3.6" rx="0.95" fill="#3fa9ea" />
      <rect x="15.5" y="8.9" width="1.9" height="3.6" rx="0.95" fill="#3fa9ea" />
      <rect x="9.5" y="16.6" width="5" height="2" rx="1" fill="#34284f" />
    </svg>
  );
}

// A checked exercise: a green check after the exercise label, not the word
// "Verificat" in the actions column. The label cell owns the whole row, so
// one mark there says the teacher agrees with both the points and the
// comment. The sr-only word keeps the state readable by screen readers.
function ReviewCheck() {
  return (
    <span className="review-check" title="Verificat">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="sr-only">Verificat</span>
    </span>
  );
}

// The final words to the student, all editable in place: Rezumat, Ce a lucrat
// bine, Recomandări.
function FeedbackSections({ submissionId, evaluation, onSaved }: { submissionId: number; evaluation: EvaluationInfo; onSaved: Saved }) {
  return (
    <div className="feedback-grid">
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
    </div>
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
    <section className="feedback-card" aria-label="Rezumat">
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
        <p>
          <MathText text={evaluation.summary} />
        </p>
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
    <section className="feedback-card" aria-label={title}>
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
            <li key={index}>
              <MathText text={text} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">{emptyHint}</p>
      )}
    </section>
  );
}
