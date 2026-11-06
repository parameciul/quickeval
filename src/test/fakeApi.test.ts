import { describe, expect, it } from 'vitest';
import { createFakeApi, FAKE_STARTED_AT, fakePoint, fakeTest, fakeUpload } from './fakeApi.ts';

const GRADED_AT = '2026-10-07T09:00:00.000Z';

describe('the fake teacher API', () => {
  it('clears the grading of an upload row on a reset and on a regrade, as the server does', async () => {
    const graded = (studentId: number, submissionId: number) =>
      fakeUpload({
        studentId,
        studentName: `Elev ${studentId}`,
        submissionId,
        status: 'graded',
        grade: 6.5,
        total: 65,
        maxTotal: 100,
        flagCount: 1,
        reviewPoints: [fakePoint(1000 + studentId)],
      });
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 2 }],
      students: {},
      tests: [fakeTest({ status: 'done', startedAt: '2026-10-06T07:00:00.000Z' }, [graded(1, 11), graded(2, 12)])],
    });
    await api.regradeSubmission(11, GRADED_AT);
    await api.resetSubmission(12, FAKE_STARTED_AT);
    const { uploads } = await api.getTest('6E2-26T1');
    expect(uploads.find((row) => row.studentId === 1)).toMatchObject({ status: 'submitted', total: null, maxTotal: null, reviewPoints: [] });
    expect(uploads.find((row) => row.studentId === 2)).toMatchObject({ status: 'none', total: null, maxTotal: null, reviewPoints: [] });
  });
});
