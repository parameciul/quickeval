import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestApi, type TestApi } from '../test/testApi.ts';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest, testIdOf } from '../test/fixtures.ts';
import { countingRows } from '../test/rowsRead.ts';
import { dataVersion } from './version.ts';

let api: TestApi;
let code: string;
let studentIds: number[];

beforeAll(async () => {
  api = await startTestApi();
  const cls = await makeClass(api, '9A', ['Ana Pop', 'Ion Stan', 'Eva Dinu']);
  studentIds = cls.studentIds;
  code = await makeTest(api, cls.id);
});

afterAll(async () => {
  await api.dispose();
});

const version = () => dataVersion(api.db, api.teacherId);

// The version before and after a change, which must differ.
async function changes(change: () => Promise<unknown>): Promise<void> {
  const before = await version();
  await change();
  expect(await version()).not.toBe(before);
}

describe('the teacher data version', () => {
  beforeEach(async () => {
    await api.db.prepare('UPDATE runner_state SET start_failed_at = NULL, last_check_at = NULL WHERE id = 1').run();
  });

  it('is served at /api/admin/version and stays the same while nothing changes', async () => {
    const first = await api.request('GET', '/api/admin/version');
    expect(first.status).toBe(200);
    expect(typeof first.body.version).toBe('string');
    const second = await api.request('GET', '/api/admin/version');
    expect(second.body.version).toBe(first.body.version);
    expect(await version()).toBe(first.body.version);
  });

  it('changes with a new test, a change of a test and a deleted test', async () => {
    const cls = await makeClass(api, '9B');
    let other = '';
    await changes(async () => {
      other = await makeTest(api, cls.id, 'Alt test');
    });
    await changes(() => api.request('PATCH', `/api/admin/tests/${other}`, { title: 'Nume nou' }));
    await changes(() => api.request('DELETE', `/api/admin/tests/${other}`));
  });

  it('changes with a student upload, its files, its status and its deletion', async () => {
    let submissionId = 0;
    await changes(async () => {
      submissionId = await addSubmission(api, code, studentIds[0]!);
    });
    await changes(() =>
      api.db
        .prepare(
          `INSERT INTO submission_files (submission_id, r2_key, original_name, content_type, size, position, created_at)
           VALUES (?, 'v/1.jpg', 'poza.jpg', 'image/jpeg', 100, 1, '2026-10-06T08:10:00.000Z')`,
        )
        .bind(submissionId)
        .run(),
    );
    await changes(() => api.db.prepare('DELETE FROM submission_files WHERE submission_id = ?').bind(submissionId).run());
    await changes(() => api.db.prepare("UPDATE submissions SET status = 'submitted' WHERE id = ?").bind(submissionId).run());
    await changes(() => api.db.prepare('DELETE FROM submissions WHERE id = ?').bind(submissionId).run());
  });

  it('changes with a grading, a correction of its points and a check', async () => {
    const submissionId = await addSubmission(api, code, studentIds[1]!, { status: 'graded' });
    let evaluationId = 0;
    await changes(async () => {
      evaluationId = await addEvaluation(api, submissionId, { items: [{ needsReview: true }] });
    });
    await changes(() => api.db.prepare('UPDATE evaluations SET total = 5 WHERE id = ?').bind(evaluationId).run());
    await changes(() =>
      api.db.prepare("UPDATE evaluation_items SET reviewed_at = '2026-10-07T10:00:00.000Z' WHERE evaluation_id = ?").bind(evaluationId).run(),
    );
  });

  it('changes when a start of the robot failed, and when the robot checked in after it', async () => {
    await changes(() => api.db.prepare("UPDATE runner_state SET start_failed_at = '2026-10-07T10:00:00.000Z' WHERE id = 1").run());
    await changes(() => api.db.prepare("UPDATE runner_state SET last_check_at = '2026-10-07T10:01:00.000Z' WHERE id = 1").run());
  });

  it('does not change with the robot checking in while no start failed', async () => {
    const before = await version();
    await api.db.prepare("UPDATE runner_state SET last_check_at = '2026-10-07T11:00:00.000Z' WHERE id = 1").run();
    expect(await version()).toBe(before);
  });

  it('does not change with another teacher\'s work', async () => {
    const before = await version();
    const other = await otherTeacherTest(api);
    const testId = await testIdOf(api, other.code);
    await api.db.prepare("UPDATE tests SET title = 'Altceva' WHERE id = ?").bind(testId).run();
    await addSubmission(api, other.code, other.studentId);
    expect(await version()).toBe(before);
  });

  it('gives a new teacher a version', async () => {
    const id = await api.addTeacher('nou@example.com', 'Profesor Nou');
    expect(await dataVersion(api.db, id)).toBe('0||');
  });

  it('reads two rows, whatever the teacher has', async () => {
    const { db, rows } = countingRows(api.db);
    await dataVersion(db, api.teacherId);
    expect(rows()).toBeLessThanOrEqual(2);
  });
});
