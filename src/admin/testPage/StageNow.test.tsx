import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TestInfo, UploadRow } from '../../../shared/api.ts';
import { PDF_TYPE } from '../../../shared/files.ts';
import { createFakeApi, fakeTest, fakeUpload, noCesVariant } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { ApiError } from '../api.ts';

// The "Acum" box that tops every stage's panel (spec 2026-11-19): the state
// in one line, a green tick once the stage is done, the stage's action, and
// "Urmează" with a link to the next stage.
const PAGE = '/tests/6E2-26T1';
const TEST_FILE = { name: 'Test.pdf', type: PDF_TYPE };
const BAREM_FILE = { name: 'Barem.pdf', type: PDF_TYPE };
const READY = { status: 'ready' as const, fromWord: false };

const students = (): UploadRow[] => [fakeUpload({ studentId: 10, studentName: 'Pop Ion' }), fakeUpload({ studentId: 11, studentName: 'Stan Eva' })];

function apiWith(overrides: Partial<TestInfo>, rows: UploadRow[] = students()) {
  return createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: rows.length }],
    students: {},
    tests: [fakeTest(overrides, rows)],
  });
}

const title = (text: string) => screen.findByText(text, { selector: '.now-title' });
const next = () => screen.getByText('Urmează').closest('p');

describe('the "Acum" box of Pregătire', () => {
  it('names what the test misses and leads to Tipărire', async () => {
    renderAdmin(`${PAGE}#prepare`, apiWith({ files: { test: TEST_FILE, barem: null } }));
    expect(await title('Lipsește baremul')).not.toHaveClass('is-done');
    expect(screen.getByText('Acum · te așteaptă')).toBeInTheDocument();
    expect(screen.getByText(/^Fără barem, lucrările trimise așteaptă\./)).toBeInTheDocument();
    expect(next()).toHaveTextContent('Urmează Tipărești testul cu cod QR la etapa Tipărire.');
    // The files sit under it, in a section with how many are ready.
    expect(screen.getByRole('heading', { level: 3, name: 'Fișierele' })).toBeInTheDocument();
    expect(screen.getByText('1 din 2 gata')).toBeInTheDocument();
  });

  it('names both files when both are missing', async () => {
    renderAdmin(`${PAGE}#prepare`, apiWith({}));
    expect(await title('Lipsesc testul și baremul')).toBeInTheDocument();
    expect(screen.getByText('0 din 2 gata')).toBeInTheDocument();
  });

  it('says the barem is being made, then that the generated one waits for a check', async () => {
    const { unmount } = renderAdmin(`${PAGE}#prepare`, apiWith({ files: { test: TEST_FILE, barem: null }, barem: { request: 'requested', unchecked: false } }));
    expect(await title('Se generează baremul')).toBeInTheDocument();
    unmount();
    renderAdmin(`${PAGE}#prepare`, apiWith({ files: { test: TEST_FILE, barem: BAREM_FILE }, barem: { request: 'none', unchecked: true } }));
    expect(await title('Verifică baremul generat')).toBeInTheDocument();
    expect(screen.getByText('Citește-l mai jos și confirmă-l. Până atunci, corectarea nu pornește.')).toBeInTheDocument();
  });

  it('ticks a test whose files are ready', async () => {
    renderAdmin(`${PAGE}#prepare`, apiWith({ files: { test: TEST_FILE, barem: BAREM_FILE }, print: READY }));
    expect(await title('Testul și baremul sunt gata')).toHaveClass('is-done');
    expect(screen.getByText('gata', { selector: '.stage-section-meta' })).toBeInTheDocument();
  });

  it('marks the files with the labels of every other table: green ready, orange missing', async () => {
    renderAdmin(`${PAGE}#prepare`, apiWith({ files: { test: TEST_FILE, barem: null } }));
    const files = within((await screen.findByRole('heading', { level: 3, name: 'Fișierele' })).closest('section')!);
    expect(files.getByText('gata')).toHaveClass('tag', 'tag-ok');
    expect(files.getByText('lipsește')).toHaveClass('tag', 'tag-wait');
  });
});

describe('the "Acum" box of Tipărire', () => {
  it('ticks the test with the QR code once it is ready, and leads to În clasă', async () => {
    renderAdmin(`${PAGE}#print`, apiWith({ files: { test: TEST_FILE, barem: BAREM_FILE }, print: READY }));
    expect(await title('Testul cu cod QR e gata de tipărit')).toHaveClass('is-done');
    expect(next()).toHaveTextContent('Urmează În ziua testului, îl începi la etapa În clasă.');
    expect(screen.getByRole('heading', { level: 3, name: 'De tipărit' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Testul cu cod QR' })).toBeInTheDocument();
  });

  it('says the test with the QR code is being made', async () => {
    renderAdmin(`${PAGE}#print`, apiWith({ files: { test: TEST_FILE, barem: BAREM_FILE } }));
    expect(await title('Se pregătește testul cu cod QR')).not.toHaveClass('is-done');
  });

  it('says when it could not be made', async () => {
    renderAdmin(`${PAGE}#print`, apiWith({ files: { test: TEST_FILE, barem: BAREM_FILE }, print: { status: 'failed', fromWord: false } }));
    expect(await title('Testul cu cod QR nu s-a putut face')).toBeInTheDocument();
    expect(screen.getByText('Acum · te așteaptă')).toBeInTheDocument();
  });

  it('leads to Pregătire while the test file is missing', async () => {
    renderAdmin(`${PAGE}#print`, apiWith({}));
    expect(await title('Lipsește testul')).toBeInTheDocument();
    const needs = screen.getByRole('list', { name: 'Ce așteaptă etapa' });
    expect(within(needs).getByRole('link', { name: 'Mergi la Pregătire' })).toHaveAttribute('href', '/tests/6E2-26T1#prepare');
  });
});

describe('the checklist of a stage that has not started', () => {
  it('ticks what is done, marks what waits on the teacher, and greys what comes later, also for a screen reader', async () => {
    renderAdmin(`${PAGE}#grading`, apiWith({ files: { test: TEST_FILE, barem: null }, print: READY }));
    const needs = await screen.findByRole('list', { name: 'Ce așteaptă etapa' });
    const items = within(needs).getAllByRole('listitem');
    expect(items.map((item) => item.className)).toEqual(['is-done', 'is-wait', 'is-later', 'is-later']);
    expect(items.map((item) => item.textContent)).toEqual([
      'Testul gata: încărcat',
      'Baremul te așteaptă: lipseșteMergi la Pregătire',
      'Testul început urmează: nu încă: îl începi în ziua testuluiMergi la În clasă',
      'Lucrări trimise urmează: 0 din 2',
    ]);
  });

  it('adds the CES files a class with a CES student still misses', async () => {
    renderAdmin(`${PAGE}#grading`, apiWith({ files: { test: TEST_FILE, barem: BAREM_FILE }, print: READY, ces: noCesVariant({ studentCount: 1 }) }));
    const needs = await screen.findByRole('list', { name: 'Ce așteaptă etapa' });
    expect(within(needs).getAllByRole('listitem').map((item) => item.querySelector('strong')?.textContent)).toEqual([
      'Testul',
      'Baremul',
      'Testul CES',
      'Baremul CES',
      'Testul început',
      'Lucrări trimise',
    ]);
  });

  it('says on În clasă that the test can start anyway only while something waits', async () => {
    const { unmount } = renderAdmin(`${PAGE}#in-class`, apiWith({ files: { test: TEST_FILE, barem: null }, print: READY }));
    expect(await screen.findByText('Poți începe oricum. Ce lipsește adaugi și după, la etapa Pregătire.')).toBeInTheDocument();
    unmount();
    renderAdmin(`${PAGE}#in-class`, apiWith({ files: { test: TEST_FILE, barem: BAREM_FILE }, print: READY }));
    expect(await screen.findByRole('button', { name: 'Începe testul' })).toBeInTheDocument();
    expect(screen.queryByText(/^Poți începe oricum/)).not.toBeInTheDocument();
  });
});

describe('the uploads switch', () => {
  const open = (): Partial<TestInfo> => ({ status: 'open', startedAt: '2026-10-06T07:15:00.000Z', files: { test: TEST_FILE, barem: BAREM_FILE }, print: READY });

  it('moves at once while the close saves', async () => {
    const api = apiWith(open());
    // The save waits until the test lets it go, then does what the fake API does.
    const save = api.setUploadsClosed.getMockImplementation()!;
    let answer: () => void = () => undefined;
    api.setUploadsClosed.mockImplementationOnce((code, closed) => new Promise((resolve) => (answer = () => resolve(save(code, closed)))));
    renderAdmin(`${PAGE}#in-class`, api);
    const toggle = await screen.findByRole('switch', { name: /^Încărcarea lucrărilor/ });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(toggle);
    // Before the answer: the switch, its word and the band already say closed.
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveTextContent('Închisă');
    expect(toggle.closest('.uploads-band')).toHaveClass('is-shut');
    expect(api.setUploadsClosed).toHaveBeenCalledWith('6E2-26T1', true);
    // A second click while it saves does nothing.
    await userEvent.click(toggle);
    expect(api.setUploadsClosed).toHaveBeenCalledTimes(1);
    answer();
    // Once saved and read again, the test itself says closed.
    await vi.waitFor(() => expect(toggle).not.toHaveAttribute('aria-disabled', 'true'));
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Încărcarea e închisă.')).toBeInTheDocument();
  });

  it('goes back with the error when the close fails', async () => {
    const api = apiWith(open());
    api.setUploadsClosed.mockRejectedValueOnce(new ApiError(409, 'closed', 'Corectarea a pornit, așa că încărcarea e deja închisă. O poți redeschide.'));
    renderAdmin(`${PAGE}#in-class`, api);
    const toggle = await screen.findByRole('switch', { name: /^Încărcarea lucrărilor/ });
    await userEvent.click(toggle);
    expect(await screen.findByText('Corectarea a pornit, așa că încărcarea e deja închisă. O poți redeschide.')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });
});

describe('Fișa testului', () => {
  it('sets a word at text size and keeps a number large', async () => {
    renderAdmin(`${PAGE}#prepare`, apiWith({}));
    const sheet = within(await screen.findByRole('region', { name: 'Fișa testului' }));
    expect(sheet.getByText('lipsește')).toHaveClass('is-word');
    expect(sheet.getByText('2')).not.toHaveClass('is-word');
  });
});
