import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubmissionDetail } from '../../../shared/api.ts';
import { createFakeApi, fakeEvaluation, fakeItem, fakeTest, fakeUpload, reviewPointsOf } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';
import * as render_ from '../pdf/renderPdf.ts';
import * as share from '../pdf/share.ts';

// "Rezultatul elevului" in the head of the paper page: the result link and
// the student's PDF, behind one button that says whether the result is
// published.

vi.mock('../pdf/renderPdf.ts', () => ({ renderPdf: vi.fn() }));
vi.mock('../pdf/share.ts', () => ({ saveFile: vi.fn(), shareFile: vi.fn(), canShareFiles: vi.fn(() => false) }));

const renderPdf = vi.mocked(render_.renderPdf);
const saveFile = vi.mocked(share.saveFile);
const shareFile = vi.mocked(share.shareFile);
const canShareFiles = vi.mocked(share.canShareFiles);
const blob = new Blob(['%PDF-'], { type: 'application/pdf' });

const graded: SubmissionDetail = {
  id: 5,
  testCode: '6E2-26T1',
  testTitle: 'Fracții',
  testStatus: 'done',
  studentId: 10,
  studentName: 'Pop Ion',
  status: 'graded',
  autoSubmitted: false,
  startedAt: '2026-10-06T07:20:00.000Z',
  submittedAt: '2026-10-06T07:40:00.000Z',
  lastError: null,
  files: [{ id: 21, name: 'IMG_0001.jpg', contentType: 'image/jpeg', size: 820 * 1024, position: 1 }],
  evaluation: fakeEvaluation([fakeItem({ id: 31, exerciseId: 'I.1', label: 'Subiectul I, ex. 1', points: 4.5 })]),
  resultToken: 'abcdefghijkmnop2abcdefcd',
  resultsOpen: false,
};

const apiWith = (detail: SubmissionDetail = graded) =>
  createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 1 }],
    students: {},
    tests: [
      fakeTest({ status: detail.testStatus }, [
        fakeUpload({
          studentId: 10,
          studentName: 'Pop Ion',
          submissionId: 5,
          status: detail.status,
          fileCount: 1,
          flagCount: reviewPointsOf(detail.evaluation).length,
          reviewPoints: reviewPointsOf(detail.evaluation),
        }),
      ]),
    ],
    submissions: [structuredClone(detail)],
  });

const page = '/tests/6E2-26T1/papers/5';
const url = () => `${window.location.origin}/u/result/abcdefghijkmnop2abcdefcd`;

async function openPanel() {
  await userEvent.click(await screen.findByRole('button', { name: /^Rezultatul elevului/ }));
  return screen.getByRole('group', { name: 'Rezultatul elevului' });
}

// What the browser offers: a share sheet for links, and one for files.
function shareSheet(share: ((data: ShareData) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  renderPdf.mockResolvedValue(blob);
  canShareFiles.mockReturnValue(false);
  shareSheet(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  shareSheet(undefined);
});

describe('the result button of the paper page', () => {
  it('says on the button that the result is not published, and opens the panel under it', async () => {
    renderAdmin(page, apiWith());
    const button = await screen.findByRole('button', { name: /^Rezultatul elevului/ });
    expect(button).toHaveTextContent('Nepublicat');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    const panel = await openPanel();
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('aria-controls', panel.id);
    expect(within(panel).getByText('Elevul nu vede rezultatul încă. Linkul merge după ce publici rezultatul.')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Mergi la Rezultate' })).toHaveAttribute('href', '/tests/6E2-26T1#results');
    expect(within(panel).getByRole('button', { name: 'Copiază linkul' })).toHaveAccessibleDescription('Îl lipești într-un email sau într-un mesaj.');
    expect(within(panel).getByRole('button', { name: 'Descarcă PDF' })).toBeInTheDocument();
  });

  it('says that a published result can be seen, with no way to Rezultate', async () => {
    renderAdmin(page, apiWith({ ...graded, resultsOpen: true }));
    const button = await screen.findByRole('button', { name: /^Rezultatul elevului/ });
    expect(within(button).getByText('Publicat')).toHaveClass('tag-ok');
    const panel = await openPanel();
    expect(within(panel).getByText('Elevul își poate vedea rezultatul.')).toBeInTheDocument();
    expect(within(panel).queryByRole('link', { name: 'Mergi la Rezultate' })).not.toBeInTheDocument();
  });

  it('copies the link in one click and opens the result as the student sees it', async () => {
    const user = userEvent.setup();
    renderAdmin(page, apiWith());
    await user.click(await screen.findByRole('button', { name: /^Rezultatul elevului/ }));
    const panel = screen.getByRole('group', { name: 'Rezultatul elevului' });
    await user.click(within(panel).getByRole('button', { name: 'Copiază linkul' }));
    expect(await navigator.clipboard.readText()).toBe(url());
    expect(within(panel).getByRole('button', { name: 'Copiat!' })).toBeInTheDocument();
    const open = within(panel).getByRole('link', { name: 'Deschide rezultatul' });
    expect(open).toHaveAttribute('href', url());
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).toHaveAttribute('rel', 'noopener noreferrer');
    // The address is never a field on the page while the copy works.
    expect(screen.queryByDisplayValue(url())).not.toBeInTheDocument();
  });

  it('shows the link in a field when the browser refuses to copy it', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new DOMException('Refuzat', 'NotAllowedError'));
    renderAdmin(page, apiWith());
    await user.click(await screen.findByRole('button', { name: /^Rezultatul elevului/ }));
    await user.click(within(screen.getByRole('group', { name: 'Rezultatul elevului' })).getByRole('button', { name: 'Copiază linkul' }));
    expect(await screen.findByLabelText('Linkul cu rezultatul elevului Pop Ion')).toHaveValue(url());
  });

  it('makes the link of an older paper first', async () => {
    const user = userEvent.setup();
    const api = apiWith({ ...graded, resultToken: null });
    renderAdmin(page, api);
    await user.click(await screen.findByRole('button', { name: /^Rezultatul elevului/ }));
    const panel = screen.getByRole('group', { name: 'Rezultatul elevului' });
    expect(within(panel).queryByRole('button', { name: 'Copiază linkul' })).not.toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Fă linkul' }));
    expect(api.getResultLink).toHaveBeenCalledWith(5, '2026-10-06T07:20:00.000Z');
    // The focus stays in the panel, on the button that took the place of "Fă linkul".
    await vi.waitFor(() => expect(within(panel).getByRole('button', { name: 'Copiază linkul' })).toHaveFocus());
  });

  it('opens again fresh after a copy', async () => {
    const user = userEvent.setup();
    renderAdmin(page, apiWith());
    const button = await screen.findByRole('button', { name: /^Rezultatul elevului/ });
    await user.click(button);
    await user.click(within(screen.getByRole('group', { name: 'Rezultatul elevului' })).getByRole('button', { name: 'Copiază linkul' }));
    expect(screen.getByRole('button', { name: 'Copiat!' })).toBeInTheDocument();
    await user.click(button);
    await user.click(button);
    expect(within(screen.getByRole('group', { name: 'Rezultatul elevului' })).getByRole('button', { name: 'Copiază linkul' })).toBeInTheDocument();
  });

  it('says "Copiat!" when the share sheet fails and the link goes to the clipboard', async () => {
    const user = userEvent.setup();
    shareSheet(vi.fn(async () => Promise.reject(new DOMException('no', 'NotAllowedError'))));
    renderAdmin(page, apiWith());
    await user.click(await screen.findByRole('button', { name: /^Rezultatul elevului/ }));
    const panel = screen.getByRole('group', { name: 'Rezultatul elevului' });
    await user.click(within(panel).getByRole('button', { name: 'Trimite linkul' }));
    expect(await navigator.clipboard.readText()).toBe(url());
    expect(within(panel).getByRole('button', { name: 'Copiat!' })).toBeInTheDocument();
  });

  it('keeps the focus on the PDF button while the PDF is made', async () => {
    let done: (value: Blob) => void = () => undefined;
    renderPdf.mockReturnValue(new Promise<Blob>((resolve) => (done = resolve)));
    renderAdmin(page, apiWith());
    const panel = await openPanel();
    const download = within(panel).getByRole('button', { name: 'Descarcă PDF' });
    await userEvent.click(download);
    expect(download).toHaveAttribute('aria-disabled', 'true');
    expect(download).toHaveFocus();
    expect(within(panel).getByText('Se face PDF-ul…')).toBeInTheDocument();
    // A second click while it is made does nothing.
    await userEvent.click(download);
    expect(renderPdf).toHaveBeenCalledTimes(1);
    done(blob);
    await vi.waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    expect(download).not.toHaveAttribute('aria-disabled');
  });

  it('has no sends where the device has no share sheet', async () => {
    renderAdmin(page, apiWith());
    const panel = await openPanel();
    expect(within(panel).queryByRole('button', { name: 'Trimite linkul' })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Trimite PDF-ul' })).not.toBeInTheDocument();
  });

  it('sends the link and the PDF through the share sheet where the device has one', async () => {
    const sheet = vi.fn(async () => undefined);
    shareSheet(sheet);
    canShareFiles.mockReturnValue(true);
    shareFile.mockResolvedValue('shared');
    renderAdmin(page, apiWith());
    const panel = await openPanel();
    await userEvent.click(within(panel).getByRole('button', { name: 'Trimite linkul' }));
    expect(sheet).toHaveBeenCalledWith({ url: url(), title: '6E2-26T1 · Pop Ion' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Trimite PDF-ul' }));
    expect(shareFile).toHaveBeenCalledWith(blob, expect.stringMatching(/\.pdf$/), '6E2-26T1 · Pop Ion');
  });

  it('downloads the PDF, made only when asked for', async () => {
    renderAdmin(page, apiWith());
    const panel = await openPanel();
    expect(renderPdf).not.toHaveBeenCalled();
    await userEvent.click(within(panel).getByRole('button', { name: 'Descarcă PDF' }));
    expect(saveFile).toHaveBeenCalledWith(blob, expect.stringMatching(/\.pdf$/));
  });

  it('closes on Esc, with the focus back on its button', async () => {
    renderAdmin(page, apiWith());
    await openPanel();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'Rezultatul elevului' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Rezultatul elevului/ })).toHaveFocus();
  });

  it('goes to Rezultate of the test', async () => {
    renderAdmin(page, apiWith(), <LocationProbe />);
    const panel = await openPanel();
    await userEvent.click(within(panel).getByRole('link', { name: 'Mergi la Rezultate' }));
    await expectLocation('/tests/6E2-26T1#results');
  });

  it('leaves the review keys alone while the focus is in the panel', async () => {
    const flagged: SubmissionDetail = {
      ...graded,
      evaluation: fakeEvaluation([
        fakeItem({ id: 31, exerciseId: 'I.1', label: 'Subiectul I, ex. 1', points: 4.5 }),
        fakeItem({ id: 32, exerciseId: 'II.1', label: 'Subiectul II, ex. 1', points: 1, needsReview: true, reviewReason: 'Scrisul nu se citește.' }),
      ]),
    };
    const api = apiWith(flagged);
    renderAdmin(`${page}?item=32`, api, <LocationProbe />);
    expect(await screen.findByRole('button', { name: 'Accept 1p' })).toBeInTheDocument();
    const panel = await openPanel();
    within(panel).getByRole('button', { name: 'Copiază linkul' }).focus();
    await userEvent.keyboard('a');
    await userEvent.keyboard('j');
    expect(api.correctItem).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent('/tests/6E2-26T1/papers/5?item=32');
  });

  it('is not there before the paper is graded, and nothing takes its place under the head', async () => {
    for (const status of ['uploading', 'submitted', 'grading', 'failed'] as const) {
      const { unmount } = renderAdmin(
        page,
        apiWith({ ...graded, testStatus: 'evaluating', status, evaluation: null, submittedAt: status === 'uploading' ? null : graded.submittedAt }),
      );
      expect(await screen.findByRole('heading', { level: 1, name: 'Pop Ion' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Rezultatul elevului/ })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Alte acțiuni' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Toate notele elevului' })).toHaveAttribute('href', '/students/10');
      unmount();
    }
  });
});
