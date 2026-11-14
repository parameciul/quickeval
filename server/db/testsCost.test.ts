import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApi, type TestApi } from '../test/testApi.ts';
import { makeClass, makeTest, testIdOf } from '../test/fixtures.ts';
import { countingRows } from '../test/rowsRead.ts';
import { findTest, listTests } from './tests.ts';

// The rows D1 reads are what the free plan counts (5 million a day), and the
// tests list is read again every minute while a teacher page is open. These
// tests keep the list and one test's row cheap on a full class: a few rows
// per paper (before one pass per table, it was about 25).

const TESTS = 8;
const STUDENTS = 30;
const ITEMS = 10;

let api: TestApi;
let codes: string[] = [];

beforeAll(async () => {
  api = await startTestApi();
  const names = Array.from({ length: STUDENTS }, (_, index) => `Elev ${String(index + 1).padStart(2, '0')}`);
  const cls = await makeClass(api, '9A', names);
  for (let index = 0; index < TESTS; index++) codes.push(await makeTest(api, cls.id, `Test ${index + 1}`));
  for (const code of codes) {
    const testId = await testIdOf(api, code);
    await api.db
      .prepare(
        `INSERT INTO submissions (test_id, student_id, status, started_at, submitted_at, graded_at)
         SELECT ?, e.student_id, 'graded', '2026-10-06T08:00:00.000Z', '2026-10-06T08:30:00.000Z', '2026-10-07T09:00:00.000Z'
         FROM enrollments e WHERE e.class_id = ?`,
      )
      .bind(testId, cls.id)
      .run();
    await api.db
      .prepare(
        `INSERT INTO evaluations (submission_id, max_total, office_points, total, grade, needs_review, summary,
           strengths_json, recommendations_json, unreadable_json, raw_json, created_at, updated_at)
         SELECT s.id, 10, 1, 9, 9, 1, 'Rezumat.', '[]', '[]', '[]', '{}', '2026-10-07T09:00:00.000Z', '2026-10-07T09:00:00.000Z'
         FROM submissions s WHERE s.test_id = ?`,
      )
      .bind(testId)
      .run();
    await api.db
      .prepare(
        `WITH RECURSIVE n(k) AS (SELECT 1 UNION ALL SELECT k + 1 FROM n WHERE k < ${ITEMS})
         INSERT INTO evaluation_items (evaluation_id, exercise_id, position, label, max_points, ai_points, points,
           student_answer, comment, confidence, needs_review, review_reason, reviewed_at)
         SELECT ev.id, 'E' || n.k, n.k, 'Exercițiu', 1, 1, 1, 'r', 'c', 'high', CASE WHEN n.k = 1 THEN 1 ELSE 0 END,
           CASE WHEN n.k = 1 THEN 'Verifică' ELSE '' END, NULL
         FROM evaluations ev JOIN submissions s ON s.id = ev.submission_id, n WHERE s.test_id = ?`,
      )
      .bind(testId)
      .run();
  }
}, 60_000);

afterAll(async () => {
  await api.dispose();
});

describe('the rows the tests list reads', () => {
  it('gives the right counts on a full class', async () => {
    const tests = await listTests(api.db, api.teacherId, 2026);
    expect(tests).toHaveLength(TESTS);
    for (const test of tests) {
      expect(test.studentCount).toBe(STUDENTS);
      expect(test.submittedCount).toBe(STUDENTS);
      expect(test.gradedCount).toBe(STUDENTS);
      expect(test.flagCount).toBe(STUDENTS);
      expect(test.publishedCount).toBe(0);
      expect(test.averageGrade).toBe(9);
    }
  });

  it('reads a bounded number of rows for the whole year', async () => {
    const { db, rows } = countingRows(api.db);
    await listTests(db, api.teacherId, 2026);
    expect(rows()).toBeLessThan(TESTS * STUDENTS * 8);
  });

  it('reads a bounded number of rows for one test', async () => {
    const { db, rows } = countingRows(api.db);
    await findTest(db, api.teacherId, codes[0]!);
    expect(rows()).toBeLessThan(STUDENTS * 8);
  });
});
