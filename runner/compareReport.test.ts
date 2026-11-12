import { describe, expect, it } from 'vitest';
import type { ExerciseList, GeneratedBarem, Grading } from '../shared/schemas.ts';
import { baremShape, differences, flagCount, listShape, meanDistance, reportMarkdown, type TestRun, verdict } from './compareReport.ts';

const LIST: ExerciseList = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [
    { id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 4.5, answer: '3/4', scoringNotes: '', topic: 'Fracții' },
    { id: 'II.1', label: 'Subiectul II, exercițiul 1', maxPoints: 4.5, answer: 'x = 2', scoringNotes: '', topic: 'Ecuații' },
  ],
  notes: '',
};

const BAREM: GeneratedBarem = {
  title: 'Test de evaluare – Fracții',
  subtitle: 'Matematică – clasa a VI-a',
  notes: [],
  total: 100,
  officePoints: 10,
  parts: [{ title: '', sections: [{ title: 'SUBIECTUL I', points: 90, items: [{ label: '1.', steps: [{ text: 'Calcul', points: 90 }] }] }] }],
};

function grading(points: [number, number], flagged: [boolean, boolean] = [false, false], comment = 'Corect.'): Grading {
  const items = (['I.1', 'II.1'] as const).map((exerciseId, index) => ({
    exerciseId,
    position: index + 1,
    label: exerciseId,
    maxPoints: 4.5,
    points: points[index]!,
    studentAnswer: '',
    comment,
    confidence: 'high' as const,
    needsReview: flagged[index]!,
    reviewReason: flagged[index] ? 'Verifică.' : '',
    page: 1,
    areas: [],
  }));
  const total = 1 + points[0] + points[1];
  return { maxTotal: 10, officePoints: 1, total, grade: total, needsReview: flagged.some(Boolean), summary: '', strengths: [], recommendations: [], unreadable: [], items };
}

function run(overrides: Partial<TestRun> = {}): TestRun {
  return {
    code: '6E2-26T1',
    liveList: LIST,
    lists: { old: LIST, new: LIST },
    barems: { old: BAREM, new: BAREM },
    subjects: { list: { value: 'matematica', name: '' }, barem: { value: 'matematica', name: '' } },
    papers: [
      { paper: 1, old: grading([4, 2]), new: grading([4, 2]), teacher: { 'I.1': 4, 'II.1': 2.5 } },
      { paper: 2, old: grading([4.5, 4.5], [false, true]), new: grading([4.5, 4.5], [false, true]), teacher: { 'I.1': 4.5, 'II.1': 4.5 } },
    ],
    ...overrides,
  };
}

describe('the comparison of the two skills', () => {
  it('writes a list and a barem as comparable shapes', () => {
    expect(listShape(LIST)).toBe('total 10 | oficiu 1 | I.1:4,5 | II.1:4,5');
    expect(baremShape(BAREM)).toBe('total 100 | oficiu 10 | —: SUBIECTUL I (90p): 1. 90p');
  });

  it('measures the mean distance from the teacher and counts the flags', () => {
    expect(meanDistance(run(), 'old')).toBe(0.25);
    expect(flagCount(run(), 'new')).toBe(1);
  });

  it('passes when nothing changed', () => {
    expect(verdict(run())).toEqual({ pass: true, reasons: [] });
  });

  it('fails when the new skill does not find math', () => {
    const result = verdict(run({ subjects: { list: { value: 'fizica', name: '' }, barem: null } }));
    expect(result.pass).toBe(false);
    expect(result.reasons).toEqual([
      'Materia găsită cu lista de exerciții nu este matematica (fizica).',
      'Materia găsită cu baremul generat nu este matematica (niciuna).',
    ]);
  });

  it('fails when the lists or the barems differ', () => {
    const other = { ...LIST, exercises: [LIST.exercises[0]!, { ...LIST.exercises[1]!, maxPoints: 4 }], totalPoints: 9.5 };
    const shorter = { ...BAREM, parts: [{ title: '', sections: [{ ...BAREM.parts[0]!.sections[0]!, title: 'SUBIECTUL II' }] }] };
    expect(verdict(run({ lists: { old: LIST, new: other }, barems: { old: BAREM, new: shorter } })).reasons).toEqual([
      'Listele de exerciții au alte exerciții sau alte punctaje.',
      'Baremele generate au altă structură sau alte punctaje.',
    ]);
  });

  it('allows the new skill 0.1 points more distance per paper, and no more', () => {
    const closer = run();
    closer.papers[0]!.new = grading([4, 2.3]);
    expect(meanDistance(closer, 'new')).toBe(0.1);
    expect(verdict(closer).pass).toBe(true);
    const farther = run();
    farther.papers[0]!.new = grading([4, 1.5]);
    expect(verdict(farther).reasons).toEqual(['Noua corectare se depărtează mai mult de punctajele profesorului: 0,5 față de 0,25 puncte pe lucrare.']);
  });

  it('allows one flag more or less on a few, and fails on more', () => {
    const one = run();
    one.papers[0]!.new = grading([4, 2], [true, false]);
    expect(verdict(one).pass).toBe(true);
    const many = run();
    many.papers[0]!.new = grading([4, 2], [true, true]);
    expect(verdict(many).reasons).toEqual(['Numărul de puncte de verificat s-a schimbat prea mult: 3 față de 1.']);
  });

  it('fails when a side could not grade a paper', () => {
    const missing = run();
    missing.papers[1]!.new = null;
    expect(verdict(missing).reasons).toEqual(['1 lucrări nu au fost corectate de ambele părți.']);
  });

  it('lists the items that differ, with both comments and the teacher’s points', () => {
    const paper = { paper: 1, old: grading([4, 2], [false, false], 'Vechi.'), new: grading([4, 3], [false, true], 'Nou.'), teacher: { 'I.1': 4, 'II.1': 2.5 } };
    expect(differences(paper)).toEqual([
      { exerciseId: 'II.1', teacher: 2.5, old: { points: 2, flagged: false, comment: 'Vechi.' }, new: { points: 3, flagged: true, comment: 'Nou.' } },
    ]);
  });

  it('writes a Romanian report that numbers the papers and names no student', () => {
    const changed = run();
    changed.papers[0]!.new = grading([4, 2.5], [false, false], 'Bine.');
    const text = reportMarkdown([changed]);
    expect(text).toContain('# Comparația corectării la matematică');
    expect(text).toContain('Rezultat: **trece** pe toate testele.');
    expect(text).toContain('## Testul 6E2-26T1');
    expect(text).toContain('| Lucrarea 1 | 7 | 7,5 | 7,5 |');
    expect(text).toContain('### Lucrarea 1: ce diferă');
    expect(text).toContain('  - nouă: 2,5. Bine.');
    expect(reportMarkdown([run({ subjects: { list: null, barem: null } })])).toContain('Rezultat: **nu trece**.');
  });
});
