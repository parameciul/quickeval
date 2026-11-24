import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router';
import type { ClassReport } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import type { ExerciseStats, ClassStats, ReportTable } from '../../../shared/stats.ts';
import { GRADE_GROUP_LEVELS, missingNote, pointsLevel } from '../../ui/format.ts';
import { CesTag } from '../CesTag.tsx';
import { CheckMark } from '../submissionPage/GradedResult.tsx';
import { GradeChip } from '../testPage/GradeChip.tsx';
import { t } from '../../i18n/t.ts';

const dash = '—';
const grade = (value: number | null) => (value === null ? dash : formatPoints(value));

// "Pe scurt" (spec §11.3): the average, the median, the lowest and the highest
// grade, and how many active students were graded. The average is in its
// grade colour, as on the test page's "Raportul clasei" card.
export function ReportTiles({ stats }: { stats: ClassStats }) {
  const tiles: [string, string, string | undefined][] = [
    [t('Media testului'), grade(stats.average), stats.average === null ? undefined : `points-${pointsLevel(stats.average, 10)}`],
    [t('Mediana'), grade(stats.median), undefined],
    [t('Cea mai mică notă'), grade(stats.min), undefined],
    [t('Cea mai mare notă'), grade(stats.max), undefined],
  ];
  return (
    <dl className="report-tiles">
      {tiles.map(([label, value, colour]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd className={colour}>{value}</dd>
        </div>
      ))}
      <div>
        <dt>{t('Corectate')}</dt>
        <dd>
          {stats.gradedCount} <small>{t('din {activeCount} elevi', { activeCount: stats.activeCount })}</small>{' '}
          {stats.flaggedCount > 0 && <small className="is-waiting">{t('de verificat {flaggedCount}', { flaggedCount: stats.flaggedCount })}</small>}
        </dd>
      </div>
    </dl>
  );
}

// "Notele pe grupe": a bar per group of grades, in the colour of its grades
// (as on the test page), with its count.
export function GradeGroups({ stats }: { stats: ClassStats }) {
  const most = Math.max(1, ...stats.groups.map((group) => group.count));
  return (
    <section className="class-card report-groups" aria-labelledby="report-groups-title">
      <div className="class-card-head">
        <h2 id="report-groups-title">{t('Notele pe grupe')}</h2>
      </div>
      <ul className="report-bars" aria-labelledby="report-groups-title">
        {stats.groups.map((group, index) => (
          <li key={group.label}>
            <span>{group.label}</span>
            <span className="report-bar" aria-hidden="true">
              <span className={`bar-${GRADE_GROUP_LEVELS[index]}`} style={{ width: `${(group.count / most) * 100}%` }}></span>
            </span>
            <span className="report-bars-count">{group.count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Whether the element's content is wider than its box, kept up to date as
// either changes size (where the browser has ResizeObserver).
function useScrollsSideways(ref: RefObject<HTMLElement | null>): boolean {
  const [scrolls, setScrolls] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setScrolls(element.scrollWidth > element.clientWidth + 1);
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, [ref]);
  return scrolls;
}

// One row for each graded student of one table: the points of each exercise
// (an item that waits for the teacher's check is marked), the total and the
// grade, drawn as on the test page: no bold, the grade a `GradeChip` and the
// points to check an orange pill beside it. An active student with no graded
// paper has a row that says why (in the class table: `missing` is empty for
// the CES table). On a phone the grade comes right after the name and the
// total last; the name and the grade stay while the points scroll (`is-phone`
// in brand.css), the pill shows only the count beside the "to check" icon, and
// `scrollHint` says to swipe over the table, only while it is wider than its box.
export function ResultsTable({
  code,
  table,
  missing,
  caption = t('Punctajele elevilor pe exerciții'),
  phone = false,
  scrollHint = false,
}: {
  code: string;
  table: ReportTable;
  missing: ClassReport['missing'];
  caption?: string;
  phone?: boolean;
  scrollHint?: boolean;
}) {
  const { exercises, rows } = table;
  const wrap = useRef<HTMLDivElement>(null);
  const scrolls = useScrollsSideways(wrap);
  const exerciseHeads = exercises.map((exercise) => (
    <th key={exercise.id} scope="col" className="num" title={exercise.label}>
      {exercise.id}
      <span className="report-max">{formatPoints(exercise.maxPoints)}p</span>
    </th>
  ));
  const totalHead = (
    <th key="total" scope="col" className="num">
      {t('Total')}
    </th>
  );
  const gradeHead = (
    <th key="grade" scope="col" className="grade-col">
      {t('Nota')}
    </th>
  );
  return (
    <>
      {phone && scrollHint && scrolls && <p className="hint report-scroll-hint">{t('Glisează tabelul spre stânga pentru punctaje.')}</p>}
      <div className="table-wrap" ref={wrap}>
        <table className={phone ? 'report-table results-table is-phone' : 'report-table results-table'}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th scope="col">{t('Elev')}</th>
              {phone ? [gradeHead, ...exerciseHeads, totalHead] : [...exerciseHeads, totalHead, gradeHead]}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const points = exercises.map((exercise) => {
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
                    {item.flagged && <span className="sr-only">{' '}{t('(de verificat)')}</span>}
                  </td>
                );
              });
              const total = (
                <td key="total" className="num">
                  {formatPoints(row.total)} / {formatPoints(row.maxTotal)}
                </td>
              );
              const grade = (
                <td key="grade" className="grade-col">
                  <GradeChip grade={row.grade} />
                  {row.flagCount > 0 &&
                    (phone ? (
                      <span className="points-pill">
                        <CheckMark />
                        <span aria-hidden="true">{row.flagCount}</span>
                        <span className="sr-only">{t('{flagCount} de verificat', { flagCount: row.flagCount })}</span>
                      </span>
                    ) : (
                      <span className="points-pill">{t('{flagCount} de verificat', { flagCount: row.flagCount })}</span>
                    ))}
                </td>
              );
              return (
                <tr key={row.submissionId}>
                  <th scope="row">
                    <Link to={`/tests/${code}/papers/${row.submissionId}`}>{row.studentName}</Link>
                    {(row.ces || row.variant === 'ces') && <CesTag />}
                  </th>
                  {phone ? [grade, ...points, total] : [...points, total, grade]}
                </tr>
              );
            })}
            {missing.map((student) => (
              <tr key={`missing-${student.studentId}`} className="is-muted">
                <th scope="row">
                  {student.studentName}
                  {student.ces && <CesTag />}
                </th>
                <td colSpan={exercises.length + 2}>
                  <span className="missing-note">{missingNote(student.status)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Average points, the share of the maximum (with a bar), and how many students
// got all, some, and none of the points: of the class table, or of the CES one.
export function ExerciseStatsTable({ perExercise, caption = t('Statistici pe exerciții') }: { perExercise: ExerciseStats[]; caption?: string }) {
  return (
    <div className="table-wrap">
      <table className="report-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{t('Exercițiul')}</th>
            <th scope="col" className="num">
              {t('Media')}
            </th>
            <th scope="col" className="report-share">
              {t('% din maxim')}
            </th>
            <th scope="col" className="num">
              {t('Tot')}
            </th>
            <th scope="col" className="num">
              {t('Parțial')}
            </th>
            <th scope="col" className="num">
              {t('Nimic')}
            </th>
          </tr>
        </thead>
        <tbody>
          {perExercise.map((exercise) => (
            <tr key={exercise.exerciseId}>
              <th scope="row">{exercise.label}</th>
              <td className="num">
                {exercise.averagePoints === null ? dash : t('{formatPoints} din {formatPoints2}', { formatPoints: formatPoints(exercise.averagePoints), formatPoints2: formatPoints(exercise.maxPoints) })}
              </td>
              <td className="report-share">
                {exercise.averagePercent === null ? (
                  dash
                ) : (
                  <span className="report-share-line">
                    <span className="report-bar" aria-hidden="true">
                      <span style={{ width: `${exercise.averagePercent}%` }}></span>
                    </span>
                    <span className="report-share-value">{exercise.averagePercent}%</span>
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
