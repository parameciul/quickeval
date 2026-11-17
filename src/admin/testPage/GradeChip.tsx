import { formatPoints } from '../../../shared/scoring.ts';
import { pointsLevel } from '../../ui/format.ts';

// A grade in a soft chip of its colour, read at a glance: the scale of the
// class report's points (`.points-N`, 9-10 dark green down to red under 2,5).
// Never bold, but for an average. Points still to check stay in their own orange label, next to
// the chip: a grade's colour never says that something waits.
// `average` outlines the chip and makes its number bold: the class page's
// "Media" row, apart from the students' grades above it.
export function GradeChip({ grade, average = false }: { grade: number; average?: boolean }) {
  return <span className={`grade-chip points-${pointsLevel(grade, 10)}${average ? ' is-average' : ''}`}>{formatPoints(grade)}</span>;
}
