import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
import { NEEDS_CES_BAREM } from '../db/runner.ts';
import { addCesFiles, addSubmission, makeClass, makeTest, markCes, startTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// The CES switch (spec: CES switch and missing warnings): "Test separat pentru
// elevii cu CES", on by default; off removes the CES files.

let api: TestApi;
let dispatchRobot: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
let classId: number;
let students: number[];
let code: string;

const setTest = (sql: string) => api.db.prepare(`UPDATE tests SET ${sql} WHERE code = ?`).bind(code).run();
const testOf = async (target = code) => (await api.request('GET', `/api/admin/tests/${target}`)).body.test;
const listed = async () => (await api.request('GET', '/api/admin/tests?year=2026')).body.tests.find((t: { code: string }) => t.code === code);
const setOff = (off: boolean) => api.request('PUT', `/api/admin/tests/${code}/ces/off`, { off });

beforeEach(async () => {
  dispatchRobot = vi.fn(async () => true);
  api = await startTestApi({ app: { dispatchRobot } });
  const cls = await makeClass(api, '9R2', ['Bursașiu Teodor', 'Ene Ana']);
  classId = cls.id;
  students = cls.studentIds;
  code = await makeTest(api, classId);
});

afterEach(async () => {
  await api.dispose();
});

describe('a new test and the CES switch', () => {
  it('is on unless Test nou turned it off', async () => {
    expect((await testOf()).ces.off).toBe(false);
    const res = await api.request('POST', '/api/admin/tests', { classId, title: 'Fără CES', cesOff: true });
    expect(res.status).toBe(201);
    expect((await testOf(res.body.code)).ces.off).toBe(true);
  });

  it('gives the tests list what the CES variant has, wanted only with an active CES student and the switch on', async () => {
    expect((await listed()).prepared.ces).toEqual({ wanted: false, testFile: false, baremFile: false, baremRequest: 'none' });
    await markCes(api, students[0]!);
    expect((await listed()).prepared.ces).toEqual({ wanted: true, testFile: false, baremFile: false, baremRequest: 'none' });
    await addCesFiles(api, code, ['test']);
    await setTest("ces_barem_request = 'requested'");
    expect((await listed()).prepared.ces).toEqual({ wanted: true, testFile: true, baremFile: false, baremRequest: 'requested' });
    await setTest('ces_off = 1');
    expect((await listed()).prepared.ces.wanted).toBe(false);
  });
});

describe('PUT /ces/off', () => {
  it('off removes the CES files, from the database and from R2; on asks for them again', async () => {
    await markCes(api, students[0]!);
    const key = `t/1/2026/${code}/ces/test/test-adaptat.pdf`;
    await api.env.FILES.put(key, '%PDF-1.7 ces');
    await setTest(`ces_test_file_key = '${key}', ces_test_file_name = 'Test adaptat.pdf', ces_test_file_type = '${PDF_TYPE}'`);
    const off = await setOff(true);
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ ces: { off: true, files: { test: null, barem: null } }, robot: null });
    expect(await api.env.FILES.get(key)).toBeNull();
    expect((await listed()).prepared.ces.wanted).toBe(false);

    const on = await setOff(false);
    expect(on.body).toMatchObject({ ces: { off: false }, robot: null });
    expect((await listed()).prepared.ces.wanted).toBe(true);
  });

  it('is refused once a paper went to grading with the CES variant', async () => {
    await addCesFiles(api, code);
    const id = await addSubmission(api, code, students[0]!, { status: 'graded', files: 1 });
    await api.db.prepare("UPDATE submissions SET variant = 'ces' WHERE id = ?").bind(id).run();
    const res = await setOff(true);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ces_papers');
    expect((await testOf()).ces).toMatchObject({ off: false, files: { test: { name: 'ces-test.pdf' } } });
  });

  it('starts the robot during the evaluation: the CES papers that waited go as class papers', async () => {
    await startTest(api, code);
    await addCesFiles(api, code, ['test']);
    await markCes(api, students[0]!);
    await addSubmission(api, code, students[0]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating'");
    const res = await setOff(true);
    expect(res.body.robot).toBe('dispatched');
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });

  it('answers 404 for an unknown test', async () => {
    expect((await api.request('PUT', '/api/admin/tests/9R2-26T9/ces/off', { off: true })).status).toBe(404);
  });
});

describe('a CES file', () => {
  it('turns the switch on', async () => {
    await setOff(true);
    const res = await api.fetch(`/api/admin/tests/${code}/ces/files/test`, {
      method: 'PUT',
      body: new TextEncoder().encode('%PDF-1.7 ces'),
      headers: { 'Content-Type': PDF_TYPE, 'X-File-Name': encodeURIComponent('Test adaptat.pdf') },
    });
    expect(res.status).toBe(200);
    expect((await testOf()).ces.off).toBe(false);
  });
});

describe('the CES barem job', () => {
  it('waits while the class barem is being generated', async () => {
    const waiting = async () =>
      (await api.db.prepare(`SELECT COUNT(*) AS n FROM tests t WHERE ${NEEDS_CES_BAREM}`).first<{ n: number }>())!.n;
    await addCesFiles(api, code, ['test']);
    await setTest("ces_barem_request = 'requested', barem_request = 'requested'");
    expect(await waiting()).toBe(0);
    await setTest("barem_request = 'none'");
    expect(await waiting()).toBe(1);
  });
});
