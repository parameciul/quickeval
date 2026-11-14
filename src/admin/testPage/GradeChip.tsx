import { formatPoints } from '../../../shared/scoring.ts';
import { pointsLevel } from '../../ui/format.ts';

// A grade in a soft chip of its colour, read at a glance: the scale of the
// class report's points (`.points-N`, 9-10 dark green down to red under 2,5).
// Never bold. Points still to check stay in their own orange label, next to
// the chip: a grade's colour never says that something waits.
export function GradeChip({ grade }: { grade: number }) {
  return <span className={`grade-chip points-${pointsLevel(grade, 10)}`}>{formatPoints(grade)}</span>;
}
