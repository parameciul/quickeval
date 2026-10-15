import type { ExerciseList } from '../../shared/schemas.ts';

// One stored item of a graded result, with the evaluation it belongs to.
export interface StoredItem {
  evaluationId: number;
  gradedAt: string;
  exerciseId: string;
  label: string;
  maxPoints: number;
  position: number;
}

export interface ExerciseColumn {
  id: string;
  label: string;
  maxPoints: number;
  topic: string;
  answer: string;
  scoringNotes: string;
}

// The exercise columns of a test. The saved exercise list gives the order and
// the extras (topic, answer, scoring notes). An exercise that the list lacks,
// or every exercise when the list was cleared by a barem or notes change, comes
// from the stored items of the graded results: the newest evaluation (graded
// time, then id) names the label and maximum, and its order comes first, then
// the exercises only older evaluations had, by position.
export function exerciseColumns(list: ExerciseList | null, items: StoredItem[]): ExerciseColumn[] {
  const columns: ExerciseColumn[] = (list?.exercises ?? []).map(({ id, label, maxPoints, topic, answer, scoringNotes }) => ({
    id,
    label,
    maxPoints,
    topic,
    answer,
    scoringNotes,
  }));
  const known = new Set(columns.map((column) => column.id));

  const newer = (a: StoredItem, b: StoredItem) =>
    a.gradedAt !== b.gradedAt ? a.gradedAt > b.gradedAt : a.evaluationId > b.evaluationId;
  const best = new Map<string, StoredItem>();
  let newest: StoredItem | null = null;
  for (const item of items) {
    const current = best.get(item.exerciseId);
    if (!current || newer(item, current)) best.set(item.exerciseId, item);
    if (!newest || newer(item, newest)) newest = item;
  }
  const inNewest = newest ? items.filter((item) => item.evaluationId === newest.evaluationId) : [];
  const order = new Map<string, number>();
  inNewest.forEach((item) => order.set(item.exerciseId, item.position));
  const extras = [...best.values()]
    .filter((item) => !known.has(item.exerciseId))
    .sort((a, b) => {
      const aNew = order.has(a.exerciseId);
      const bNew = order.has(b.exerciseId);
      if (aNew !== bNew) return aNew ? -1 : 1;
      return a.position - b.position || (a.exerciseId < b.exerciseId ? -1 : 1);
    });
  for (const item of extras) {
    columns.push({ id: item.exerciseId, label: item.label, maxPoints: item.maxPoints, topic: '', answer: '', scoringNotes: '' });
  }
  return columns;
}
