import type { ExerciseList, FoundSubject, GeneratedBarem, Grading } from '../shared/schemas.ts';
import { formatPoints, round2 } from '../shared/scoring.ts';

// The report of `npm run compare:skills` (spec: any subject, "The math
// comparison"): the old grading skill against the new one on real math tests,
// and both against the teacher's final points. Pure functions, so the rules of
// the verdict are tested. Papers are numbered, never named.

export type Side = 'old' | 'new';

export interface PaperRun {
  // 1, 2, … in the order the tool read the papers.
  paper: number;
  // The checked grading of each side; null when that side could not grade it.
  old: Grading | null;
  new: Grading | null;
  // The teacher's final points of each exercise (evaluation_items.points).
  teacher: Record<string, number>;
}

export interface TestRun {
  code: string;
  // The exercise list that the live test uses: both sides grade against it.
  liveList: ExerciseList;
  lists: Record<Side, ExerciseList | null>;
  barems: Record<Side, GeneratedBarem | null>;
  // What the new skill found, with the list and with the barem.
  subjects: { list: FoundSubject | null; barem: FoundSubject | null };
  papers: PaperRun[];
}

export interface Verdict {
  pass: boolean;
  // Romanian, one line per rule that failed.
  reasons: string[];
}

// The largest rise of the mean distance from the teacher's points, per paper.
export const MAX_DISTANCE_RISE = 0.1;
// The share of flags by which the two skills may differ.
export const MAX_FLAG_CHANGE = 0.1;

// The ids and points of a list, with its totals, as one comparable text.
export function listShape(list: ExerciseList): string {
  const items = list.exercises.map((exercise) => `${exercise.id}:${formatPoints(exercise.maxPoints)}`);
  return [`total ${formatPoints(list.totalPoints)}`, `oficiu ${formatPoints(list.officePoints)}`, ...items].join(' | ');
}

// The variants, subjects and items of a barem with their points, as one comparable text.
export function baremShape(barem: GeneratedBarem): string {
  const parts = barem.parts.map((part) => {
    const sections = part.sections.map((section) => {
      const items = section.items.map((item) => `${item.label} ${item.steps.reduce((sum, step) => sum + step.points, 0)}p`);
      return `${section.title} (${section.points}p): ${items.join(', ')}`;
    });
    return `${part.title || '—'}: ${sections.join('; ')}`;
  });
  return [`total ${barem.total}`, `oficiu ${barem.officePoints}`, ...parts].join(' | ');
}

function teacherTotal(paper: PaperRun, grading: Grading): number {
  return round2(grading.items.reduce((sum, item) => sum + (paper.teacher[item.exerciseId] ?? 0), grading.officePoints));
}

// The mean distance between a side's totals and the teacher's, over the papers
// both sides graded; null when there is none.
export function meanDistance(run: TestRun, side: Side): number | null {
  const both = run.papers.filter((paper) => paper.old && paper.new);
  if (both.length === 0) return null;
  const sum = both.reduce((total, paper) => total + Math.abs(paper[side]!.total - teacherTotal(paper, paper[side]!)), 0);
  return round2(sum / both.length);
}

// The items a side flagged, over the papers both sides graded.
export function flagCount(run: TestRun, side: Side): number {
  return run.papers
    .filter((paper) => paper.old && paper.new)
    .reduce((count, paper) => count + paper[side]!.items.filter((item) => item.needsReview).length, 0);
}

export interface ItemDifference {
  exerciseId: string;
  teacher: number | null;
  old: { points: number; flagged: boolean; comment: string };
  new: { points: number; flagged: boolean; comment: string };
}

// The items whose points or flag differ between the two sides.
export function differences(paper: PaperRun): ItemDifference[] {
  if (!paper.old || !paper.new) return [];
  const newer = new Map(paper.new.items.map((item) => [item.exerciseId, item]));
  return paper.old.items.flatMap((before) => {
    const after = newer.get(before.exerciseId);
    if (!after || (after.points === before.points && after.needsReview === before.needsReview)) return [];
    return [
      {
        exerciseId: before.exerciseId,
        teacher: paper.teacher[before.exerciseId] ?? null,
        old: { points: before.points, flagged: before.needsReview, comment: before.comment },
        new: { points: after.points, flagged: after.needsReview, comment: after.comment },
      },
    ];
  });
}

// The rules of the spec, for one test.
export function verdict(run: TestRun): Verdict {
  const reasons: string[] = [];
  for (const [where, found] of [['lista de exerciții', run.subjects.list], ['baremul generat', run.subjects.barem]] as const) {
    if (found?.value !== 'matematica') reasons.push(`Materia găsită cu ${where} nu este matematica (${found ? found.value : 'niciuna'}).`);
  }
  if (!run.lists.old || !run.lists.new) reasons.push('O parte nu a făcut lista de exerciții.');
  else if (listShape(run.lists.old) !== listShape(run.lists.new)) reasons.push('Listele de exerciții au alte exerciții sau alte punctaje.');
  if (!run.barems.old || !run.barems.new) reasons.push('O parte nu a generat baremul.');
  else if (baremShape(run.barems.old) !== baremShape(run.barems.new)) reasons.push('Baremele generate au altă structură sau alte punctaje.');
  const graded = run.papers.filter((paper) => paper.old && paper.new).length;
  if (graded < run.papers.length) reasons.push(`${run.papers.length - graded} lucrări nu au fost corectate de ambele părți.`);
  const [before, after] = [meanDistance(run, 'old'), meanDistance(run, 'new')];
  if (before !== null && after !== null && after > round2(before + MAX_DISTANCE_RISE)) {
    reasons.push(`Noua corectare se depărtează mai mult de punctajele profesorului: ${formatPoints(after)} față de ${formatPoints(before)} puncte pe lucrare.`);
  }
  const [flagsBefore, flagsAfter] = [flagCount(run, 'old'), flagCount(run, 'new')];
  if (Math.abs(flagsAfter - flagsBefore) > Math.ceil(MAX_FLAG_CHANGE * Math.max(flagsBefore, flagsAfter))) {
    reasons.push(`Numărul de puncte de verificat s-a schimbat prea mult: ${flagsAfter} față de ${flagsBefore}.`);
  }
  return { pass: reasons.length === 0, reasons };
}

const points = (value: number | null) => (value === null ? '—' : formatPoints(value));

// The whole report, in Romanian Markdown.
export function reportMarkdown(runs: TestRun[]): string {
  const lines = ['# Comparația corectării la matematică', ''];
  const verdicts = runs.map(verdict);
  lines.push(verdicts.every((one) => one.pass) ? 'Rezultat: **trece** pe toate testele.' : 'Rezultat: **nu trece**. Motivele sunt la fiecare test.', '');
  runs.forEach((run, index) => {
    const result = verdicts[index]!;
    lines.push(`## Testul ${run.code}`, '');
    lines.push(result.pass ? 'Trece.' : 'Nu trece:', ...result.reasons.map((reason) => `- ${reason}`), '');
    lines.push(`- Materia găsită: cu lista ${run.subjects.list?.value ?? '—'}, cu baremul ${run.subjects.barem?.value ?? '—'}.`);
    lines.push(`- Lista folosită pe site: ${listShape(run.liveList)}`);
    lines.push(`- Lista veche: ${run.lists.old ? listShape(run.lists.old) : '—'}`);
    lines.push(`- Lista nouă: ${run.lists.new ? listShape(run.lists.new) : '—'}`);
    lines.push(`- Baremul vechi: ${run.barems.old ? baremShape(run.barems.old) : '—'}`);
    lines.push(`- Baremul nou: ${run.barems.new ? baremShape(run.barems.new) : '—'}`);
    lines.push(
      `- Distanța medie față de profesor, pe lucrare: veche ${points(meanDistance(run, 'old'))}, nouă ${points(meanDistance(run, 'new'))}.`,
      `- Puncte de verificat: vechi ${flagCount(run, 'old')}, noi ${flagCount(run, 'new')}.`,
      '',
      '| Lucrarea | Veche | Nouă | Profesor |',
      '| --- | --- | --- | --- |',
    );
    for (const paper of run.papers) {
      const teacher = paper.old ? teacherTotal(paper, paper.old) : paper.new ? teacherTotal(paper, paper.new) : null;
      lines.push(`| Lucrarea ${paper.paper} | ${points(paper.old?.total ?? null)} | ${points(paper.new?.total ?? null)} | ${points(teacher)} |`);
    }
    lines.push('');
    for (const paper of run.papers) {
      const changed = differences(paper);
      if (changed.length === 0) continue;
      lines.push(`### Lucrarea ${paper.paper}: ce diferă`, '');
      for (const item of changed) {
        const flag = (flagged: boolean) => (flagged ? ', de verificat' : '');
        lines.push(
          `- ${item.exerciseId} (profesor: ${points(item.teacher)})`,
          `  - veche: ${formatPoints(item.old.points)}${flag(item.old.flagged)}. ${item.old.comment}`,
          `  - nouă: ${formatPoints(item.new.points)}${flag(item.new.flagged)}. ${item.new.comment}`,
        );
      }
      lines.push('');
    }
  });
  return `${lines.join('\n').trimEnd()}\n`;
}
