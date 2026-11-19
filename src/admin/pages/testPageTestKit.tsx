import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavigate, useNavigationType } from 'react-router';
import { createFakeApi, fakeTest, fakeUpload } from '../../test/fakeApi.ts';

export const uploads = [
  fakeUpload({
    studentId: 10,
    studentName: 'Pop Ion',
    submissionId: 5,
    status: 'submitted',
    fileCount: 3,
    startedAt: '2026-10-06T07:20:00.000Z',
    submittedAt: '2026-10-06T07:40:00.000Z',
    autoSubmitted: true,
  }),
  fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 1, startedAt: '2026-10-06T07:25:00.000Z' }),
  fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
];

// The same students, none of whom has uploaded a file.
export const notSent = () => uploads.map((row) => fakeUpload({ studentId: row.studentId, studentName: row.studentName }));

export function apiWith(overrides: Parameters<typeof fakeTest>[0] = {}) {
  return createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
    students: {},
    // A copy: the fake API changes its rows, and a test must not change them for the next.
    tests: [fakeTest(overrides, structuredClone(uploads))],
  });
}

// The test page, and the address of each stage's panel (redesign spec §6).
export const PAGE = '/tests/6E2-26T1';

// Opens the panel of a stage with its link in the list of stages.
export async function openStage(name: string) {
  const stages = await screen.findByRole('navigation', { name: 'Etapele testului' });
  await userEvent.click(within(stages).getByRole('link', { name: new RegExp(`^${name} `) }));
  await screen.findByRole('heading', { level: 2, name });
}

export const sheet = () => screen.getByRole('region', { name: 'Fișa testului' });

// A fact of Fișa testului, a number of its boxes included: the text after its name.
export const fact = (name: string) => within(sheet()).getByText(name, { selector: 'dt' }).nextElementSibling;

// Opens "Acțiuni" at the top of the page.
export async function openActions() {
  await userEvent.click(await screen.findByRole('button', { name: 'Acțiuni' }));
  return screen.getByRole('menu', { name: 'Acțiuni' });
}

// Opens "Acțiuni" and picks one of its items.
export async function chooseAction(item: string) {
  await userEvent.click(within(await openActions()).getByRole('menuitem', { name: item }));
}

// The names of the items of "Acțiuni", in order, then closes it.
export async function actionNames() {
  const names = within(await openActions())
    .getAllByRole('menuitem')
    .map((item) => item.getAttribute('aria-label'));
  await userEvent.keyboard('{Escape}');
  return names;
}

// Opens a papers-table row's ⋯ and picks one of its items.
export async function chooseInRow(row: HTMLElement, student: string, item: string) {
  await userEvent.click(within(row).getByRole('button', { name: `Mai multe pentru ${student}` }));
  await userEvent.click(within(row).getByRole('menuitem', { name: item }));
}

// How the app came to this address: a stage link replaces it, so Back leaves the page.
export function NavigationProbe() {
  return <p data-testid="navigation">{useNavigationType()}</p>;
}

// A jump to the test page, as a link of the Teste page or of "De făcut" does.
export function GoToTest() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(PAGE)}>
      Mergi la test
    </button>
  );
}
