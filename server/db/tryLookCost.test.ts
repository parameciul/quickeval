import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addTry } from '../../runner/test/robotWorld.ts';
import { addTestFiles, makeClass, makeTest, startTest, testIdOf } from '../test/fixtures.ts';
import { countingRows } from '../test/rowsRead.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';
import { claimSubmission, listTasks } from './runner.ts';

// The Quick Try robot looks for work every IDLE_POLL_MS while a try is graded
// (runner/runTry.ts): one look is the try lane's task list and a claim. Its
// rows must not grow with the teachers' tests, which pile up over the years.

const TEACHER_TESTS = 300;

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
  const cls = await makeClass(api, '6E2', ['Pop Ion']);
  const code = await makeTest(api, cls.id);
  await startTest(api, code);
  await addTestFiles(api, code);
  const source = await testIdOf(api, code);
  // Copies of the teacher's test, finished: most tests are, after a few years.
  const columns = (await api.db.prepare('PRAGMA table_info(tests)').all<{ name: string }>()).results.map((column) => column.name).filter((name) => name !== 'id');
  const value = (name: string) =>
    ({
      code: "t.code || '-' || n.i",
      upload_token: "t.upload_token || '-' || n.i",
      multi_upload_token: 'NULL',
      number: 't.number + n.i',
      status: "'done'",
    })[name] ?? `t.${name}`;
  await api.db
    .prepare(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${TEACHER_TESTS})
       INSERT INTO tests (${columns.join(', ')}) SELECT ${columns.map(value).join(', ')} FROM tests t, n WHERE t.id = ?`,
    )
    .bind(source)
    .run();
  await addTry(api, 'own');
});

afterAll(async () => {
  await api.dispose();
});

describe("the Quick Try robot's look for work", () => {
  it("reads rows that do not grow with the teachers' tests", async () => {
    const counted = countingRows(api.db);
    const tasks = await listTasks(counted.db, 'try');
    expect(tasks.exerciseLists).toHaveLength(1);
    await claimSubmission(counted.db, 'try-run-0001', 'try');
    // The try's own rows and the class test the copies came from, not the
    // finished copies (before: about two full reads of the tests table).
    expect(counted.rows()).toBeLessThanOrEqual(30);
  });
});
