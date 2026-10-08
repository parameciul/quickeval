import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CHECK_THIS,
  checkExerciseList,
  checkGrading,
  cutText,
  type ExerciseList,
  exerciseListSchema,
  gradingResultSchema,
  LOW_CONFIDENCE,
  OUT_OF_RANGE,
} from './schemas.ts';

function exercise(id: string, maxPoints: number) {
  return { id, label: `Exercițiul ${id}`, maxPoints, answer: '3/4', scoringNotes: '', topic: 'Fracții' };
}

const LIST: ExerciseList = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [exercise('I.1', 4), exercise('I.2', 2.5), exercise('II.1', 2.5)],
  notes: '',
};

function item(exerciseId: string, points: number, extra: Record<string, unknown> = {}) {
  return {
    exerciseId,
    points,
    studentAnswer: '3/4',
    comment: 'Bine.',
    confidence: 'high',
    needsReview: false,
    reviewReason: '',
    ...extra,
  };
}

function grading(items: unknown[], extra: Record<string, unknown> = {}) {
  return { items, unreadable: [], summary: 'Ai lucrat bine.', strengths: ['Fracții'], recommendations: ['Exersează.'], ...extra };
}

describe('cutText', () => {
  it('trims and keeps short texts', () => {
    expect(cutText('  bine  ', 10)).toBe('bine');
  });

  it('cuts long texts and ends them with an ellipsis', () => {
    expect(cutText('abcdefghij', 5)).toBe('abcd…');
    expect(cutText('abcdefghij', 5)).toHaveLength(5);
  });

  it('never splits a character outside the basic plane', () => {
    expect(cutText('ab😀😀😀', 4)).toBe('ab😀…');
  });
});

describe('checkExerciseList', () => {
  it('accepts a list whose points add up', () => {
    const checked = checkExerciseList(LIST);
    expect(checked).toEqual({ ok: true, value: { list: LIST, status: 'ready', message: null } });
  });

  it('marks a list whose points do not add up as a problem, with the sums', () => {
    const checked = checkExerciseList({ ...LIST, exercises: [exercise('I.1', 4), exercise('I.2', 4.5)] });
    expect(checked.ok && checked.value.status).toBe('problem');
    expect(checked.ok && checked.value.message).toBe('Punctajele din barem dau 9,5, dar totalul este 10.');
  });

  it('accepts sums inside the tolerance', () => {
    const checked = checkExerciseList({ ...LIST, exercises: [exercise('I.1', 4.0004), exercise('I.2', 2.5), exercise('II.1', 2.5)] });
    expect(checked.ok && checked.value.status).toBe('ready');
  });

  it('trims ids and cuts long texts', () => {
    const long = { ...exercise(' I.1 ', 9), label: 'x'.repeat(200) };
    const checked = checkExerciseList({ ...LIST, exercises: [long] });
    if (!checked.ok) throw new Error(checked.reason);
    expect(checked.value.list.exercises[0]!.id).toBe('I.1');
    expect(checked.value.list.exercises[0]!.label).toHaveLength(120);
  });

  it.each([
    ['not an object', 'nimic'],
    ['no exercises', { ...LIST, exercises: [] }],
    ['61 exercises', { ...LIST, totalPoints: 62, exercises: Array.from({ length: 61 }, (_, i) => exercise(`E${i}`, 1)) }],
    ['a repeated id', { ...LIST, exercises: [exercise('I.1', 4.5), exercise('I.1', 4.5)] }],
    ['an empty id', { ...LIST, exercises: [exercise(' ', 9)] }],
    ['an exercise without points', { ...LIST, exercises: [exercise('I.1', 9), exercise('I.2', 0)] }],
    ['a zero total', { ...LIST, totalPoints: 0 }],
    ['office points as big as the total', { ...LIST, officePoints: 10 }],
    ['negative office points', { ...LIST, officePoints: -1 }],
  ])('refuses %s', (_name, raw) => {
    expect(checkExerciseList(raw).ok).toBe(false);
  });
});

describe('checkGrading', () => {
  it('computes the total and the grade, in the order of the list', () => {
    const checked = checkGrading(grading([item('II.1', 2), item('I.1', 4), item('I.2', 1.5)]), LIST);
    if (!checked.ok) throw new Error(checked.reason);
    expect(checked.value).toMatchObject({ maxTotal: 10, officePoints: 1, total: 8.5, grade: 8.5, needsReview: false });
    expect(checked.value.items.map((graded) => [graded.exerciseId, graded.position, graded.label, graded.maxPoints])).toEqual([
      ['I.1', 1, 'Exercițiul I.1', 4],
      ['I.2', 2, 'Exercițiul I.2', 2.5],
      ['II.1', 3, 'Exercițiul II.1', 2.5],
    ]);
  });

  it('rounds points to 2 decimals', () => {
    const checked = checkGrading(grading([item('I.1', 3.333), item('I.2', 1), item('II.1', 1)]), LIST);
    expect(checked.ok && checked.value.items[0]!.points).toBe(3.33);
    expect(checked.ok && checked.value.total).toBe(6.33);
  });

  it('clamps points outside [0, max] and flags them', () => {
    const checked = checkGrading(grading([item('I.1', 5), item('I.2', -1), item('II.1', 2)]), LIST);
    if (!checked.ok) throw new Error(checked.reason);
    expect(checked.value.items[0]).toMatchObject({ points: 4, needsReview: true, reviewReason: OUT_OF_RANGE });
    expect(checked.value.items[1]).toMatchObject({ points: 0, needsReview: true, reviewReason: OUT_OF_RANGE });
    expect(checked.value.needsReview).toBe(true);
  });

  it('always flags low confidence, with a reason', () => {
    const checked = checkGrading(
      grading([item('I.1', 4, { confidence: 'low' }), item('I.2', 2, { needsReview: true }), item('II.1', 2, { reviewReason: 'ignorat' })]),
      LIST,
    );
    if (!checked.ok) throw new Error(checked.reason);
    expect(checked.value.items.map((graded) => [graded.needsReview, graded.reviewReason])).toEqual([
      [true, LOW_CONFIDENCE],
      [true, CHECK_THIS],
      [false, ''],
    ]);
  });

  it('keeps the robot reason and adds the range reason', () => {
    const checked = checkGrading(
      grading([item('I.1', 7, { needsReview: true, reviewReason: 'Scris greu de citit' }), item('I.2', 2), item('II.1', 2)]),
      LIST,
    );
    expect(checked.ok && checked.value.items[0]!.reviewReason).toBe(`Scris greu de citit; ${OUT_OF_RANGE}`);
  });

  it('flags the whole grading when a page could not be read', () => {
    const checked = checkGrading(grading([item('I.1', 4), item('I.2', 2), item('II.1', 2)], { unreadable: ['page-02.jpg'] }), LIST);
    expect(checked.ok && checked.value.needsReview).toBe(true);
    expect(checked.ok && checked.value.unreadable).toEqual(['page-02.jpg']);
  });

  it('cuts long texts and keeps at most 5 strengths and recommendations', () => {
    const checked = checkGrading(
      grading([item('I.1', 4, { comment: 'c'.repeat(1200) }), item('I.2', 2), item('II.1', 2)], {
        summary: 's'.repeat(2000),
        strengths: ['a', 'b', 'c', 'd', 'e', 'f', ' '],
        recommendations: ['r'.repeat(400)],
      }),
      LIST,
    );
    if (!checked.ok) throw new Error(checked.reason);
    expect(checked.value.items[0]!.comment).toHaveLength(1000);
    expect(checked.value.summary).toHaveLength(1500);
    expect(checked.value.strengths).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(checked.value.recommendations[0]).toHaveLength(300);
  });

  it.each([
    ['not an object', null],
    ['a missing exercise', grading([item('I.1', 4), item('I.2', 2)])],
    ['an unknown exercise', grading([item('I.1', 4), item('I.2', 2), item('II.9', 2)])],
    ['a repeated exercise', grading([item('I.1', 4), item('I.2', 2), item('II.1', 2), item('I.1', 1)])],
    ['a wrong confidence', grading([item('I.1', 4, { confidence: 'sure' }), item('I.2', 2), item('II.1', 2)])],
  ])('refuses %s', (_name, raw) => {
    expect(checkGrading(raw, LIST).ok).toBe(false);
  });
});

describe('JSON Schemas for the robot', () => {
  it('can be made from both schemas', () => {
    for (const schema of [exerciseListSchema, gradingResultSchema]) {
      const json = z.toJSONSchema(schema) as { type: string; required: string[] };
      expect(json.type).toBe('object');
      expect(json.required.length).toBeGreaterThan(0);
    }
  });
});
