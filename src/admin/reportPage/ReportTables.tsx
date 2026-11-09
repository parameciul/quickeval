import { Link } from 'react-router';
import type { ClassReport } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import type { ExerciseStats, ClassStats, ReportTable } from '../../../shared/stats.ts';
import { pointsLevel, uploadStatusLabel } from '../../ui/format.ts';
import { CesTag } from '../CesTag.tsx';

const dash = '—';
const grade = (value: number | null) => (value === null ? dash : formatPoints(value));

// "Pe scurt" (spec §11.3): the average, the median, the lowest and the highest
// grade, and how many active students were graded.
export function ReportTiles({ stats }: { stats: ClassStats }) {
  const tiles: [string, string][] = [
    ['Media testului', grade(stats.average)],
    ['Mediana', grade(stats.median)],
    ['Cea mai mică notă', grade(stats.min)],
    ['Cea mai mare notă', grade(stats.max)],
  ];
  return (
    <dl className="report-tiles">
      {tiles.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
      <div>
        <dt>Corectate</dt>
        <dd>
          {stats.gradedCount} <small>din {stats.activeCount} elevi</small>{' '}
          {stats.flaggedCount > 0 && <small className="is-waiting">de verificat {stats.flaggedCount}</small>}
        </dd>
      </div>
    </dl>
  );
}

// "Notele pe grupe": a bar per group of grades, with its count.
export function GradeGroups({ stats }: { stats: ClassStats }) {
  const most = Math.max(1, ...stats.groups.map((group) => group.count));
  return (
    <section className="class-card report-groups" aria-labelledby="report-groups-title">
      <div className="class-card-head">
        <h2 id="report-groups-title">Notele pe grupe</h2>
      </div>
      <ul className="report-bars" aria-labelledby="report-groups-title">
        {stats.groups.map((group) => (
          <li key={group.label}>
            <span>{group.label}</span>
            <span className="report-bar" aria-hidden="true">
              <span style={{ width: `${(group.count / most) * 100}%` }}></span>
            </span>
            <b>{group.count}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}

// One row for each graded student of one table: the points of each exercise
// (an item that waits for the teacher's check is marked), the total and the
// grade. An active student with no graded paper has a row that says why (in the
// class table: `missing` is empty for the CES table).
export function ResultsTable({
  code,
  table,
  missing,
  caption = 'Punctajele elevilor pe exerciții',
}: {
  code: string;
  table: ReportTable;
  missing: ClassReport['missing'];
  caption?: string;
}) {
  const { exercises, rows } = table;
  return (
    <div className="table-wrap">
      <table className="report-table results-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Elev</th>
            {exercises.map((exercise) => (
              <th key={exercise.id} scope="col" className="num" title={exercise.label}>
                {exercise.id}
                <span className="report-max">{formatPoints(exercise.maxPoints)}p</span>
              </th>
            ))}
            <th scope="col" className="num">
              Total
            </th>
            <th scope="col" className="num">
              Nota
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.submissionId}>
              <th scope="row">
                <Link to={`/teste/${code}/elevi/${row.submissionId}`}>{row.studentName}</Link>
                {(row.ces || row.variant === 'ces') && <CesTag />}
              </th>
              {exercises.map((exercise) => {
                const item = row.items.find((candidate) => candidate.exerciseId === exercise.id);
                if (!item) {
                  return (
                    <td key={exercise.id} className="num">
                      {dash}
                    </td>
                  );
                }
                return (
                  <td key={exercise.id} className={item.flagged ? 'num flagged-cell' : 'num'}>
                    <span className={`points points-${pointsLevel(item.points, item.maxPoints)}`}>{formatPoints(item.points)}</span>
                    {item.flagged && <span className="sr-only"> (de verificat)</span>}
                  </td>
                );
              })}
              <td className="num">
                {formatPoints(row.total)} / {formatPoints(row.maxTotal)}
              </td>
              <td className="num report-grade">
                <strong className={row.flagCount > 0 ? 'is-waiting' : undefined}>{formatPoints(row.grade)}</strong>
                {row.flagCount > 0 && <span className="tag tag-wait">de verificat {row.flagCount}</span>}
              </td>
            </tr>
          ))}
          {missing.map((student) => (
            <tr key={`missing-${student.studentId}`} className="is-muted">
              <th scope="row">
                {student.studentName}
                {student.ces && <CesTag />}
              </th>
              <td colSpan={exercises.length + 2}>
                {student.status === 'none' ? 'Nu a trimis lucrarea.' : uploadStatusLabel(student.status)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Average points, the share of the maximum (with a bar), and how many students
// got all, some, and none of the points: of the class table, or of the CES one.
export function ExerciseStatsTable({ perExercise, caption = 'Statistici pe exerciții' }: { perExercise: ExerciseStats[]; caption?: string }) {
  return (
    <div className="table-wrap">
      <table className="report-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Exercițiul</th>
            <th scope="col" className="num">
              Media
            </th>
            <th scope="col" className="report-share">
              % din maxim
            </th>
            <th scope="col" className="num">
              Tot
            </th>
            <th scope="col" className="num">
              Parțial
            </th>
            <th scope="col" className="num">
              Nimic
            </th>
          </tr>
        </thead>
        <tbody>
          {perExercise.map((exercise) => (
            <tr key={exercise.exerciseId}>
              <th scope="row">{exercise.label}</th>
              <td className="num">
                {exercise.averagePoints === null ? dash : `${formatPoints(exercise.averagePoints)} din ${formatPoints(exercise.maxPoints)}`}
              </td>
              <td className="report-share">
                {exercise.averagePercent === null ? (
                  dash
                ) : (
                  <span className="report-share-line">
                    <span className="report-bar" aria-hidden="true">
                      <span style={{ width: `${exercise.averagePercent}%` }}></span>
                    </span>
                    <b>{exercise.averagePercent}%</b>
                  </span>
                )}
              </td>
              <td className="num">{exercise.full}</td>
              <td className="num">{exercise.partial}</td>
              <td className="num">{exercise.zero}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
