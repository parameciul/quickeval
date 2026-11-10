import { describe, expect, it } from 'vitest';
import {
  CHECK_THIS,
  checkClassAnalysis,
  checkExerciseList,
  checkGeneratedBarem,
  checkGrading,
  classAnalysisSchema,
  claudeJsonSchema,
  cutText,
  type ExerciseList,
  exerciseListSchema,
  generatedBaremSchema,
  gradingResultSchema,
  LOW_CONFIDENCE,
  MAX_AREAS,
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

  it('rounds points to cents, so a tiny difference is no problem', () => {
    const checked = checkExerciseList({ ...LIST, exercises: [exercise('I.1', 4.0004), exercise('I.2', 2.5), exercise('II.1', 2.5)] });
    expect(checked.ok && checked.value.status).toBe('ready');
    expect(checked.ok && checked.value.list.exercises[0]!.maxPoints).toBe(4);
  });

  it('marks thirds of a point as a problem: a perfect paper could not reach the total', () => {
    const thirds = [exercise('I.1', 3.333), exercise('I.2', 3.333), exercise('I.3', 3.333)];
    const checked = checkExerciseList({ ...LIST, officePoints: 0, exercises: thirds });
    if (!checked.ok) throw new Error(checked.reason);
    expect(checked.value.status).toBe('problem');
    expect(checked.value.message).toBe('Punctajele din barem dau 9,99, dar totalul este 10.');
    expect(checked.value.list.exercises.map((saved) => saved.maxPoints)).toEqual([3.33, 3.33, 3.33]);
  });

  it('rounds the total and the office points too', () => {
    const checked = checkExerciseList({ ...LIST, totalPoints: 10.001, officePoints: 0.999 });
    expect(checked.ok && checked.value.list).toMatchObject({ totalPoints: 10, officePoints: 1 });
    expect(checked.ok && checked.value.status).toBe('ready');
  });

  it('counts an id in characters, not in UTF-16 units', () => {
    const id = '𝐱'.repeat(20);
    const checked = checkExerciseList({ ...LIST, officePoints: 0, exercises: [exercise(id, 10)] });
    expect(checked.ok && checked.value.list.exercises[0]!.id).toBe(id);
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
    ['an exercise with less than a cent', { ...LIST, exercises: [exercise('I.1', 9), exercise('I.2', 0.004)] }],
    ['an id over 20 characters', { ...LIST, exercises: [exercise('I.'.padEnd(21, '1'), 9)] }],
    ['a total over 1000', { ...LIST, totalPoints: 1001, officePoints: 0, exercises: [exercise('I.1', 1001)] }],
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

  it('flags very_low like low, and accepts very_high like high', () => {
    const checked = checkGrading(
      grading([
        item('I.1', 4, { confidence: 'very_low' }),
        item('I.2', 2, { confidence: 'very_high' }),
        item('II.1', 2, { confidence: 'medium' }),
      ]),
      LIST,
    );
    if (!checked.ok) throw new Error(checked.reason);
    expect(checked.value.items.map((graded) => graded.needsReview)).toEqual([true, false, false]);
    expect(checked.value.items[0]!.reviewReason).toBe(LOW_CONFIDENCE);
  });

  it('puts the range reason before the robot reason', () => {
    const checked = checkGrading(
      grading([item('I.1', 7, { needsReview: true, reviewReason: 'Scris greu de citit' }), item('I.2', 2), item('II.1', 2)]),
      LIST,
    );
    expect(checked.ok && checked.value.items[0]!.reviewReason).toBe(`${OUT_OF_RANGE}; Scris greu de citit`);
  });

  it('cuts a long robot reason, and the range reason stays', () => {
    const checked = checkGrading(
      grading([item('I.1', 7, { needsReview: true, reviewReason: 'r'.repeat(600) }), item('I.2', 2), item('II.1', 2)]),
      LIST,
    );
    if (!checked.ok) throw new Error(checked.reason);
    expect(checked.value.items[0]!.reviewReason).toHaveLength(500);
    expect(checked.value.items[0]!.reviewReason.startsWith(`${OUT_OF_RANGE}; r`)).toBe(true);
  });

  it('keeps at most 20 unreadable pages', () => {
    const pages = Array.from({ length: 25 }, (_, i) => `student/page-${String(i + 1).padStart(2, '0')}.jpg`);
    const checked = checkGrading(grading([item('I.1', 4), item('I.2', 2), item('II.1', 2)], { unreadable: pages }), LIST);
    expect(checked.ok && checked.value.unreadable).toEqual(pages.slice(0, 20));
  });

  it('keeps the areas of each answer, rounded to 4 decimals, and none for a grading made before them', () => {
    const area = { page: 2, x0: 0.123456, y0: 0.2, x1: 0.9, y1: 0.45 };
    const checked = checkGrading(grading([item('I.1', 4, { areas: [area] }), item('I.2', 2), item('II.1', 2, { areas: [] })]), LIST);
    if (!checked.ok) throw new Error(checked.reason);
    expect(checked.value.items.map((graded) => graded.areas)).toEqual([[{ page: 2, x0: 0.1235, y0: 0.2, x1: 0.9, y1: 0.45 }], [], []]);
  });

  it.each([
    ['page 0', { page: 0, x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.5 }],
    ['a page that is not whole', { page: 1.5, x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.5 }],
    ['a corner past the page', { page: 1, x0: 0.1, y0: 0.1, x1: 1.2, y1: 0.5 }],
    ['a corner before the page', { page: 1, x0: -0.1, y0: 0.1, x1: 0.5, y1: 0.5 }],
    ['corners in the wrong order', { page: 1, x0: 0.5, y0: 0.1, x1: 0.1, y1: 0.5 }],
    ['an empty area', { page: 1, x0: 0.1, y0: 0.5, x1: 0.5, y1: 0.5 }],
  ])('drops an area with %s and keeps the grading', (_name, bad) => {
    const good = { page: 1, x0: 0, y0: 0, x1: 1, y1: 1 };
    const checked = checkGrading(grading([item('I.1', 4, { areas: [bad, good] }), item('I.2', 2), item('II.1', 2)]), LIST);
    if (!checked.ok) throw new Error(checked.reason);
    expect(checked.value.items[0]!.areas).toEqual([good]);
  });

  it(`keeps at most ${MAX_AREAS} areas of an answer`, () => {
    const areas = Array.from({ length: MAX_AREAS + 2 }, (_, i) => ({ page: i + 1, x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.5 }));
    const checked = checkGrading(grading([item('I.1', 4, { areas }), item('I.2', 2), item('II.1', 2)]), LIST);
    expect(checked.ok && checked.value.items[0]!.areas.map((area) => area.page)).toEqual([1, 2, 3, 4, 5, 6]);
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

describe('claudeJsonSchema', () => {
  it('makes draft-07 schemas, the version that Claude Code accepts', () => {
    for (const schema of [classAnalysisSchema, exerciseListSchema, gradingResultSchema]) {
      const json = claudeJsonSchema(schema);
      expect(json.$schema).toBe('http://json-schema.org/draft-07/schema#');
      expect(json.type).toBe('object');
      expect(json.additionalProperties).toBe(false);
    }
  });

  it('asks for every field of a grading', () => {
    const json = claudeJsonSchema(gradingResultSchema) as { required: string[] };
    expect(json.required).toEqual(['items', 'unreadable', 'summary', 'strengths', 'recommendations']);
  });

  it('asks for the areas of every answer, so Claude never leaves them out', () => {
    const json = claudeJsonSchema(gradingResultSchema) as { properties: { items: { items: { required: string[]; properties: Record<string, { items: { required: string[] } }> } } } };
    const answer = json.properties.items.items;
    expect(answer.required).toContain('areas');
    expect(answer.properties.areas!.items.required).toEqual(['page', 'x0', 'y0', 'x1', 'y1']);
  });
});

describe('checkClassAnalysis', () => {
  const analysis = {
    overview: ' Clasa a lucrat bine. ',
    strengths: ['Fracții', '  '],
    weaknesses: ['Ecuații'],
    commonMistakes: ['Semnul'],
    recommendations: ['Exersați'],
  };

  it('trims the texts and drops empty entries', () => {
    const checked = checkClassAnalysis(analysis);
    expect(checked).toEqual({
      ok: true,
      value: { ...analysis, overview: 'Clasa a lucrat bine.', strengths: ['Fracții'] },
    });
  });

  it('refuses an empty overview and a wrong shape', () => {
    expect(checkClassAnalysis({ ...analysis, overview: '  ' }).ok).toBe(false);
    expect(checkClassAnalysis({ overview: 'x' }).ok).toBe(false);
    expect(checkClassAnalysis(null).ok).toBe(false);
  });

  it('cuts the lists to 8 entries and the entries to 300 characters', () => {
    const checked = checkClassAnalysis({
      ...analysis,
      strengths: Array.from({ length: 12 }, (_, index) => `punct ${index}`),
      weaknesses: ['x'.repeat(400)],
    });
    expect(checked.ok && checked.value.strengths).toHaveLength(8);
    expect(checked.ok && Array.from(checked.value.weaknesses[0]!)).toHaveLength(300);
  });

  it('has a JSON Schema that asks for every field', () => {
    const json = claudeJsonSchema(classAnalysisSchema) as { required: string[] };
    expect(json.required).toEqual(['overview', 'strengths', 'weaknesses', 'commonMistakes', 'recommendations']);
  });
});

describe('checkGeneratedBarem', () => {
  function section(title: string, points: number, steps: number[] = [points]) {
    return {
      title,
      points,
      items: [{ label: '1.', steps: steps.map((step, index) => ({ text: `Pasul ${index + 1}`, points: step })) }],
    };
  }

  const sample = {
    title: 'Test de evaluare – Permutări',
    subtitle: 'Matematică – clasa a XI-a R1 – Timp de lucru: 50 de minute',
    notes: ['Orice soluție corectă se punctează.'],
    total: 100,
    officePoints: 10,
    parts: [{ title: '', sections: [section('SUBIECTUL I', 30, [10, 20]), section('SUBIECTUL II', 30), section('SUBIECTUL III', 30)] }],
  };

  it('accepts a barem whose points add up', () => {
    const checked = checkGeneratedBarem(sample);
    expect(checked.ok).toBe(true);
    expect(checked.ok && checked.value).toEqual(sample);
  });

  it('refuses steps that do not add up to the section', () => {
    const bad = { ...sample, parts: [{ title: '', sections: [section('SUBIECTUL I', 30, [10, 10]), section('II', 30), section('III', 30)] }] };
    expect(checkGeneratedBarem(bad).ok).toBe(false);
  });

  it('refuses sections plus din oficiu that miss the total', () => {
    expect(checkGeneratedBarem({ ...sample, total: 90 }).ok).toBe(false);
    expect(checkGeneratedBarem({ ...sample, officePoints: 5 }).ok).toBe(false);
  });

  it('checks every part on its own', () => {
    const second = { title: 'RÂNDUL II', sections: [section('I', 30), section('II', 30), section('III', 25)] };
    const checked = checkGeneratedBarem({ ...sample, parts: [{ ...sample.parts[0]!, title: 'RÂNDUL I' }, second] });
    expect(checked.ok).toBe(false);
    const fixed = { ...second, sections: [section('I', 30), section('II', 30), section('III', 30)] };
    expect(checkGeneratedBarem({ ...sample, parts: [{ ...sample.parts[0]!, title: 'RÂNDUL I' }, fixed] }).ok).toBe(true);
  });

  it.each([
    ['no parts', { ...sample, parts: [] }],
    ['an empty part', { ...sample, parts: [{ title: '', sections: [] }] }],
    ['an empty section', { ...sample, total: 10, parts: [{ title: '', sections: [{ title: 'I', points: 0, items: [] }] }] }],
    ['an empty item', { ...sample, total: 10, parts: [{ title: '', sections: [{ title: 'I', points: 0, items: [{ label: '1.', steps: [] }] }] }] }],
  ])('refuses %s', (_name, raw) => {
    expect(checkGeneratedBarem(raw).ok).toBe(false);
  });

  it('refuses a step of 0 points', () => {
    const bad = { ...sample, parts: [{ title: '', sections: [section('I', 30, [0, 30]), section('II', 30), section('III', 30)] }] };
    expect(checkGeneratedBarem(bad).ok).toBe(false);
  });

  it('refuses fractions and negative numbers', () => {
    expect(checkGeneratedBarem({ ...sample, officePoints: 10.5, total: 100.5 }).ok).toBe(false);
    expect(checkGeneratedBarem({ ...sample, officePoints: -10, total: 80 }).ok).toBe(false);
  });

  it('refuses a step with empty text and fractional section points', () => {
    const empty = { ...sample, parts: [{ title: '', sections: [{ ...section('I', 30), items: [{ label: '1.', steps: [{ text: '  ', points: 30 }] }] }, section('II', 30), section('III', 30)] }] };
    expect(checkGeneratedBarem(empty).ok).toBe(false);
    const fraction = { ...sample, total: 100.5, officePoints: 10.5 };
    expect(checkGeneratedBarem(fraction).ok).toBe(false);
    const half = { ...sample, total: 90.5, officePoints: 0, parts: [{ title: '', sections: [section('I', 90.5, [90.5])] }] };
    expect(checkGeneratedBarem(half).ok).toBe(false);
  });

  it('keeps the JSON Schema to plain numbers', () => {
    const text = JSON.stringify(claudeJsonSchema(generatedBaremSchema));
    for (const word of ['integer', 'minimum', 'maximum']) expect(text).not.toContain(word);
  });

  it('accepts officePoints 0 with total = sections', () => {
    expect(checkGeneratedBarem({ ...sample, officePoints: 0, total: 90 }).ok).toBe(true);
  });

  it('refuses too many parts, sections, items, or steps', () => {
    const part = sample.parts[0]!;
    expect(checkGeneratedBarem({ ...sample, parts: Array.from({ length: 5 }, () => part) }).ok).toBe(false);
    const manySections = Array.from({ length: 7 }, () => section('I', 10));
    expect(checkGeneratedBarem({ ...sample, total: 70, officePoints: 0, parts: [{ title: '', sections: manySections }] }).ok).toBe(false);
    const manyItems = { title: 'I', points: 31, items: Array.from({ length: 31 }, () => ({ label: '1.', steps: [{ text: 'x', points: 1 }] })) };
    expect(checkGeneratedBarem({ ...sample, total: 31, officePoints: 0, parts: [{ title: '', sections: [manyItems] }] }).ok).toBe(false);
    const manySteps = section('I', 13, Array.from({ length: 13 }, () => 1));
    expect(checkGeneratedBarem({ ...sample, total: 13, officePoints: 0, parts: [{ title: '', sections: [manySteps] }] }).ok).toBe(false);
  });

  it('refuses more than 10 notes and a wrong shape', () => {
    expect(checkGeneratedBarem({ ...sample, notes: Array.from({ length: 11 }, () => 'x') }).ok).toBe(false);
    expect(checkGeneratedBarem({ title: 'x' }).ok).toBe(false);
    expect(checkGeneratedBarem(null).ok).toBe(false);
  });

  it('trims the texts, drops empty notes, and cuts long texts', () => {
    const checked = checkGeneratedBarem({
      ...sample,
      title: `  ${'t'.repeat(300)} `,
      notes: ['  ', ' o notă ', 'n'.repeat(500)],
      parts: [{ title: '', sections: [{ ...section('I', 30), items: [{ label: '1.', steps: [{ text: 's'.repeat(2000), points: 30 }] }] }, section('II', 30), section('III', 30)] }],
    });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(Array.from(checked.value.title)).toHaveLength(200);
    expect(checked.value.notes).toHaveLength(2);
    expect(checked.value.notes[0]).toBe('o notă');
    expect(Array.from(checked.value.notes[1]!)).toHaveLength(400);
    expect(Array.from(checked.value.parts[0]!.sections[0]!.items[0]!.steps[0]!.text)).toHaveLength(1500);
  });

  it('has a JSON Schema that asks for every field', () => {
    const json = claudeJsonSchema(generatedBaremSchema) as { $schema: string; required: string[]; properties: Record<string, unknown> };
    expect(json.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(json.required).toEqual(['title', 'subtitle', 'notes', 'total', 'officePoints', 'parts']);
    expect(Object.keys(json.properties)).toEqual(['title', 'subtitle', 'notes', 'total', 'officePoints', 'parts']);
  });
});
