// The grading of a test as one bar: graded papers, sent papers that wait for
// grading, and the rest of the class (not sent). The counts are also written
// in words next to it, so the bar is only for the eye.
export function GradingProgress({
  studentCount,
  submittedCount,
  gradedCount,
}: {
  studentCount: number;
  submittedCount: number;
  gradedCount: number;
}) {
  const total = Math.max(studentCount, submittedCount);
  if (total === 0) return null;
  const graded = Math.min(gradedCount, submittedCount);
  const waiting = submittedCount - graded;
  const complete = graded > 0 && waiting === 0;
  const percent = (count: number) => `${Math.round((count / total) * 100)}%`;
  return (
    <span className={complete ? 'grading-progress grading-progress-complete' : 'grading-progress'}>
      <span className="grading-progress-bar" aria-hidden="true">
        <span className="grading-progress-graded" style={{ width: percent(graded) }} />
        <span className="grading-progress-waiting" style={{ width: percent(waiting) }} />
      </span>
      {complete && <span className="grading-progress-label">✓ Corectat complet</span>}
    </span>
  );
}
