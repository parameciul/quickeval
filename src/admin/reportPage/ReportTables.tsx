import { Link } from 'react-router';
import type { ClassReport } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import type { ClassStats } from '../../../shared/stats.ts';
import { pointsLevel, uploadStatusLabel } from '../../ui/format.ts';

const dash = '—';
const grade = (value: number | null) => (value === null ? dash : formatPoints(value));

// The numbers of the class (spec §14.2): who was graded, the average, the
// median, the lowest and the highest grade, and the groups of grades.
export function StatsSummary({ stats }: { stats: ClassStats }) {
  return (
    <section aria-label="Statistici">
      <h2>Statistici</h2>
      <p>
        Corectate {stats.gradedCount} din {stats.activeCount} elevi
        {stats.flaggedCount > 0 && ` · de verificat ${stats.flaggedCount}`}
      </p>
      <dl className="stats-grid">
        <div>
          <dt>Media</dt>
          <dd>{grade(stats.average)}</dd>
        </div>
        <div>
          <dt>Mediana</dt>
          <dd>{grade(stats.median)}</dd>
        </div>
        <div>
          <dt>Cea mai mică notă</dt>
          <dd>{grade(stats.min)}</dd>
        </div>
        <div>
          <dt>Cea mai mare notă</dt>
          <dd>{grade(stats.max)}</dd>
        </div>
      </dl>
      <div className="table-wrap">
        <table className="report-table">
          <caption className="sr-only">Notele pe grupe</caption>
          <thead>
            <tr>
              <th scope="col">Nota</th>
              <th scope="col">Elevi</th>
            </tr>
          </thead>
          <tbody>
            {stats.groups.map((group) => (
              <tr key={group.label}>
                <th scope="row">{group.label}</th>
                <td>{group.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// "claude-opus-5-5 · high"; the model alone for a grading with no effort.
export function modelCell(model: string | null, effort: string | null): string {
  if (!model) return dash;
  return effort ? `${model} · ${effort}` : model;
}

// One row for each graded student, one column for each exercise, then the
// total and the grade. An item that waits for the teacher's check is marked.
export function ResultsTable({ code, report }: { code: string; report: ClassReport }) {
  return (
    <div className="table-wrap">
      <table className="report-table results-table">
        <caption className="sr-only">Punctajele elevilor pe exerciții</caption>
        <thead>
          <tr>
            <th scope="col">Elev</th>
            {report.exercises.map((exercise) => (
              <th key={exercise.id} scope="col" title={`${exercise.label}, ${formatPoints(exercise.maxPoints)} puncte`}>
                {exercise.id}
              </th>
            ))}
            <th scope="col">Total</th>
            <th scope="col">Nota</th>
            {report.showModel && <th scope="col">Model</th>}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row) => (
            <tr key={row.submissionId}>
              <th scope="row">
                <Link to={`/teste/${code}/elevi/${row.submissionId}`}>{row.studentName}</Link>
              </th>
              {report.exercises.map((exercise) => {
                const item = row.items.find((candidate) => candidate.exerciseId === exercise.id);
                if (!item) return <td key={exercise.id}>{dash}</td>;
                return (
                  <td key={exercise.id} className={item.flagged ? 'flagged-cell' : undefined}>
                    <span className={`points points-${pointsLevel(item.points, item.maxPoints)}`}>{formatPoints(item.points)}</span>
                    {item.flagged && <span className="sr-only"> (de verificat)</span>}
                  </td>
                );
              })}
              <td>
                {formatPoints(row.total)} / {formatPoints(row.maxTotal)}
              </td>
              <td>
                <strong>{formatPoints(row.grade)}</strong>
                {row.flagCount > 0 && <span className="tag">de verificat {row.flagCount}</span>}
              </td>
              {report.showModel && <td>{modelCell(row.model, row.effort)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Average points and how many students got all, some, and none of the points.
export function ExerciseStatsTable({ stats }: { stats: ClassStats }) {
  return (
    <div className="table-wrap">
      <table className="report-table">
        <caption className="sr-only">Statistici pe exerciții</caption>
        <thead>
          <tr>
            <th scope="col">Exercițiul</th>
            <th scope="col">Media</th>
            <th scope="col">% din maxim</th>
            <th scope="col">Tot</th>
            <th scope="col">Parțial</th>
            <th scope="col">Nimic</th>
          </tr>
        </thead>
        <tbody>
          {stats.perExercise.map((exercise) => (
            <tr key={exercise.exerciseId}>
              <th scope="row" title={exercise.label}>
                {exercise.exerciseId}
                <span className="sr-only"> {exercise.label}</span>
              </th>
              <td>
                {exercise.averagePoints === null ? dash : `${formatPoints(exercise.averagePoints)} din ${formatPoints(exercise.maxPoints)}`}
              </td>
              <td>{exercise.averagePercent === null ? dash : `${exercise.averagePercent}%`}</td>
              <td>{exercise.full}</td>
              <td>{exercise.partial}</td>
              <td>{exercise.zero}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The active students that have no graded result, and why.
export function MissingList({ missing }: { missing: ClassReport['missing'] }) {
  if (missing.length === 0) return null;
  return (
    <section aria-label="Fără rezultat">
      <h2>Fără rezultat</h2>
      <ul>
        {missing.map((student) => (
          <li key={student.studentId}>
            {student.studentName} <span className="hint">· {uploadStatusLabel(student.status)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
