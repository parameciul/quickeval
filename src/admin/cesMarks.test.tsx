import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StudentHistory } from '../../shared/api.ts';
import { PDF_TYPE } from '../../shared/files.ts';
import { createFakeApi, fakeTest, fakeUpload, noCesVariant } from '../test/fakeApi.ts';
import { renderAdmin } from '../test/renderAdmin.tsx';

// The CES mark in the teacher's other lists of students (spec: CES variant),
// and the CES files in Fișa testului.

const student = (id: number, fullName: string, ces = false) => ({ id, fullName, active: true, canDelete: true, ces });

describe('the CES mark', () => {
  it('shows in the students of the paper page', async () => {
    const uploads = [
      fakeUpload({ studentId: 1, studentName: 'Bursașiu Teodor', submissionId: 11, status: 'graded', grade: 8, flagCount: 1, ces: true, variant: 'ces' }),
      fakeUpload({ studentId: 2, studentName: 'Ene Ana', submissionId: 12, status: 'graded', grade: 7, flagCount: 1 }),
    ];
    renderAdmin('/teste/6E2-26T1/verificare', createFakeApi({ classes: [], students: {}, tests: [fakeTest({ status: 'done' }, uploads)] }));
    const queue = within(await screen.findByRole('navigation', { name: 'Elevii' }));
    expect(within(queue.getByRole('link', { name: /^Bursașiu Teodor/ })).getByText('CES')).toBeInTheDocument();
    expect(within(queue.getByRole('link', { name: /^Ene Ana/ })).queryByText('CES')).not.toBeInTheDocument();
  });

  it('shows in the search results', async () => {
    const api = createFakeApi({
      classes: [{ id: 1, name: '9R2', schoolYear: 2026, archived: false, studentCount: 2 }],
      students: { 1: [student(10, 'Bursașiu Teodor', true), student(11, 'Bursuc Ana')] },
      tests: [],
    });
    renderAdmin('/cautare?q=burs', api);
    const row = (await screen.findByRole('rowheader', { name: /Bursașiu Teodor/ })).closest('tr')!;
    expect(within(row).getByText('CES')).toHaveAttribute('title', 'Cerințe educaționale speciale');
    expect(within(screen.getByRole('rowheader', { name: /Bursuc Ana/ })).queryByText('CES')).not.toBeInTheDocument();
  });

  it("shows on the student's page", async () => {
    const history: StudentHistory = {
      student: { id: 10, fullName: 'Bursașiu Teodor', ces: true },
      classes: [{ id: 1, name: '9R2', schoolYear: 2026, active: true }],
      tests: [],
      grades: [],
    };
    renderAdmin('/elevi/10', createFakeApi({ classes: [], students: {}, histories: [history] }));
    const heading = await screen.findByRole('heading', { level: 1, name: /Bursașiu Teodor/ });
    expect(within(heading).getByText('CES')).toBeInTheDocument();
  });
});

describe('Fișa testului', () => {
  it('lists the CES files and the CES print PDF', async () => {
    const file = { name: 'Test adaptat.pdf', type: PDF_TYPE };
    const test = fakeTest({
      files: { test: { name: 'test.pdf', type: PDF_TYPE }, barem: null },
      ces: noCesVariant({ studentCount: 1, files: { test: file, barem: { name: 'Barem adaptat.pdf', type: PDF_TYPE } }, print: { status: 'ready', fromWord: false } }),
    });
    renderAdmin('/teste/6E2-26T1', createFakeApi({ classes: [], students: {}, tests: [test] }));
    const sheet = within(await screen.findByRole('region', { name: 'Fișa testului' }));
    expect(sheet.getByRole('link', { name: 'Testul CES' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/ces/files/test');
    expect(sheet.getByRole('link', { name: 'Baremul CES' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/ces/files/barem');
    expect(sheet.getByRole('link', { name: 'Testul CES cu cod QR' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/ces/print');
  });

  it('lists no CES file without a CES variant', async () => {
    renderAdmin('/teste/6E2-26T1', createFakeApi({ classes: [], students: {}, tests: [fakeTest()] }));
    const sheet = within(await screen.findByRole('region', { name: 'Fișa testului' }));
    expect(sheet.queryByRole('link', { name: /CES/ })).not.toBeInTheDocument();
  });
});
