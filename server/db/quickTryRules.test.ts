import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listAccounts } from './accounts.ts';
import { askAnalysisAfterCheck, askForAnalysis } from './lifecycle.ts';
import { NEEDS_ANALYSIS, NEEDS_PRINT } from './runner.ts';
import { addEvaluation, addSubmission, addTestFiles, makeClass, makeTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// A Quick Try test (tests.quick_try = 1) is never a print job and never asks
// for a class analysis; a guest teacher (teachers.quick_try = 1) is not an account.

let api: TestApi;
let code: string;
let studentId: number;

beforeEach(async () => {
  api = await startTestApi();
  const cls = await makeClass(api, '6E2', ['Pop Ion']);
  studentId = cls.studentIds[0]!;
  code = await makeTest(api, cls.id);
});

afterEach(async () => {
  await api.dispose();
});

const markQuickTry = () => api.db.prepare('UPDATE tests SET quick_try = 1 WHERE code = ?').bind(code).run();
const ids = async (condition: string) =>
  (await api.db.prepare(`SELECT t.id FROM tests t WHERE ${condition}`).all<{ id: number }>()).results.map((row) => row.id);
const analysisStatus = async () =>
  (await api.db.prepare('SELECT analysis_status FROM tests WHERE code = ?').bind(code).first<{ analysis_status: string }>())!.analysis_status;

// The test in evaluation with one graded paper and nothing left to check.
async function gradedAndChecked(): Promise<number> {
  await addTestFiles(api, code);
  await api.db.prepare("UPDATE tests SET status = 'evaluating' WHERE code = ?").bind(code).run();
  const submissionId = await addSubmission(api, code, studentId, { status: 'graded', files: 1 });
  await addEvaluation(api, submissionId);
  return submissionId;
}

describe('the print job', () => {
  it('is made for a class test with a test file', async () => {
    await addTestFiles(api, code, ['test']);
    expect(await ids(NEEDS_PRINT)).toEqual([await testIdOf(api, code)]);
  });

  it('is never made for a Quick Try test', async () => {
    await addTestFiles(api, code, ['test']);
    await markQuickTry();
    expect(await ids(NEEDS_PRINT)).toEqual([]);
  });
});

describe('the class analysis', () => {
  it('is asked for a class test that is fully checked', async () => {
    await gradedAndChecked();
    await askForAnalysis(api.db).run();
    expect(await analysisStatus()).toBe('requested');
  });

  it('is not asked for a Quick Try test that is fully checked', async () => {
    await gradedAndChecked();
    await markQuickTry();
    await askForAnalysis(api.db).run();
    expect(await analysisStatus()).toBe('none');
  });

  it('is not asked after the last check of a Quick Try paper', async () => {
    const submissionId = await gradedAndChecked();
    await markQuickTry();
    expect(await askAnalysisAfterCheck(api.db, api.teacherId, submissionId, '2026-11-09T10:00:00.000Z')).toBe(false);
    expect(await analysisStatus()).toBe('none');
  });

  it('is not robot work for a Quick Try test, even when requested', async () => {
    await gradedAndChecked();
    await api.db.prepare("UPDATE tests SET analysis_status = 'requested' WHERE code = ?").bind(code).run();
    expect(await ids(NEEDS_ANALYSIS)).toEqual([await testIdOf(api, code)]);
    await markQuickTry();
    expect(await ids(NEEDS_ANALYSIS)).toEqual([]);
  });
});

describe('the accounts list', () => {
  it('leaves out guest teachers', async () => {
    const guest = await api.addTeacher('try-abc@quick-try.invalid', 'Încercare');
    await api.db.prepare("UPDATE teachers SET quick_try = 1, status = 'disabled' WHERE id = ?").bind(guest).run();
    const accounts = await listAccounts(api.db);
    expect(accounts.map((account) => account.id)).toEqual([api.teacherId]);
  });
});
