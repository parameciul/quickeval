import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubmissionFile } from '../../shared/api.ts';
import { ApiError } from '../ui/ApiError.ts';
import { createFakeUploadApi, LINK_TOKEN, type FakeUploadApi } from '../test/fakeUploadApi.ts';
import { expectNoGradingWords } from '../test/gradingWords.ts';
import type { ActiveSession } from './api.ts';
import { UploadScreen } from './UploadScreen.tsx';

const jpeg = (name = 'IMG_0001.jpg', bytes = 10) => new File([new Uint8Array(bytes)], name, { type: 'image/jpeg' });
const pdf = (name = 'scan.pdf') => new File(['%PDF-1.7'], name, { type: 'application/pdf' });

// The test stands in for the phone's photo shrinking: it keeps every file as it is.
const keepAsIs = vi.fn(async (file: File) => file as Blob);

function setup(files: SubmissionFile[] = []) {
  const api = createFakeUploadApi();
  api.seedSession(11, files);
  const session: ActiveSession = { studentId: 11, studentName: 'Pop Ion', secret: 'secret-11', files };
  const onSent = vi.fn();
  const onLost = vi.fn();
  render(<UploadScreen api={api} token={LINK_TOKEN} session={session} onSent={onSent} onLost={onLost} shrink={keepAsIs} />);
  return { api, onSent, onLost };
}

const pick = (files: File[]) => userEvent.upload(screen.getByLabelText('Alege fișiere'), files);

async function pages(api: FakeUploadApi, count: number) {
  await waitFor(() => expect(api.uploadFile).toHaveBeenCalledTimes(count));
  await waitFor(() => expect(screen.getAllByText('Încărcat')).toHaveLength(count));
}

beforeEach(() => {
  // jsdom has no object URLs; the previews only need a string.
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:preview'), configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  keepAsIs.mockClear();
});

describe('UploadScreen', () => {
  it('shows the photo tips, the two buttons, and a disabled send button', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Pop Ion' })).toBeInTheDocument();
    expect(screen.getByText('Prinde toată pagina în poză.')).toBeInTheDocument();
    expect(screen.getByLabelText('Fă o poză')).toHaveAttribute('capture', 'environment');
    expect(screen.getByLabelText('Alege fișiere')).toHaveAttribute('multiple');
    expect(screen.getByRole('button', { name: 'Am trimis tot' })).toBeDisabled();
    expectNoGradingWords();
  });

  it('sends the picked pages one by one, in order, after the shrink step', async () => {
    const { api } = setup();
    const first = jpeg('IMG_0001.jpg');
    const second = pdf('scan.pdf');
    await pick([first, second]);
    await pages(api, 2);
    expect(keepAsIs).toHaveBeenCalledTimes(2);
    expect(api.uploadFile.mock.calls.map((call) => call[3])).toEqual(['IMG_0001.jpg', 'scan.pdf']);
    expect(api.uploadFile.mock.calls[0]![1]).toBe('secret-11');
    expect(screen.getByRole('img', { name: 'Pagina 1' })).toHaveAttribute('src', 'blob:preview');
    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Am trimis tot' })).toBeEnabled();
  });

  it('sends a shrunk photo as a JPEG with a .jpg name', async () => {
    const { api } = setup();
    keepAsIs.mockImplementationOnce(async () => new Blob([new Uint8Array(4)], { type: 'image/jpeg' }));
    await pick([new File([new Uint8Array(40)], 'scan.png', { type: 'image/png' })]);
    await pages(api, 1);
    const [, , blob, name] = api.uploadFile.mock.calls[0]!;
    expect(name).toBe('scan.jpg');
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBe(4);
  });

  it('shows the progress of a page while it is sent', async () => {
    const { api } = setup();
    let finish: (file: SubmissionFile) => void = () => {};
    api.uploadFile.mockImplementationOnce(async (_token, _secret, _blob, _name, onProgress) => {
      onProgress(0.5);
      return new Promise<SubmissionFile>((resolve) => {
        finish = resolve;
      });
    });
    await pick([jpeg()]);
    expect(await screen.findByText(/Se încarcă… 50%/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Se încarcă IMG_0001.jpg' })).toHaveAttribute('value', '0.5');
    expect(screen.getByRole('button', { name: 'Am trimis tot' })).toBeDisabled();
    finish({ id: 1, name: 'IMG_0001.jpg', contentType: 'image/jpeg', size: 10, position: 1 });
    expect(await screen.findByText('Încărcat')).toBeInTheDocument();
  });

  it('refuses a HEIC photo before sending anything', async () => {
    const { api } = setup();
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(screen.getByLabelText('Alege fișiere'), new File(['x'], 'IMG.heic', { type: 'image/heic' }));
    expect(screen.getByRole('alert')).toHaveTextContent('IMG.heic: Trimite poze JPG sau PDF.');
    expect(api.uploadFile).not.toHaveBeenCalled();
  });

  it('takes at most 20 pages', async () => {
    const already = Array.from({ length: 19 }, (_, i) => ({ id: i + 1, name: `p${i + 1}.pdf`, contentType: 'application/pdf', size: 5, position: i + 1 }));
    const { api } = setup(already);
    await pick([pdf('a.pdf'), pdf('b.pdf')]);
    expect(screen.getByRole('alert')).toHaveTextContent('Poți trimite cel mult 20 de fișiere.');
    await waitFor(() => expect(api.uploadFile).toHaveBeenCalledTimes(1));
    expect(api.uploadFile.mock.calls[0]![3]).toBe('a.pdf');
  });

  it('refuses a page bigger than 25 MB after the shrink step', async () => {
    const { api } = setup();
    keepAsIs.mockImplementationOnce(async () => new Blob([new Uint8Array(25 * 1024 * 1024 + 1)], { type: 'application/pdf' }));
    await pick([pdf('mare.pdf')]);
    expect(await screen.findByText('Fișierul are peste 25 MB.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Încearcă din nou' })).not.toBeInTheDocument();
    expect(api.uploadFile).not.toHaveBeenCalled();
  });

  it('lets the student send a failed page again', async () => {
    const { api } = setup();
    api.uploadFile.mockRejectedValueOnce(new ApiError(0, 'network', 'Nu mă pot conecta la server. Verifică internetul și încearcă din nou.'));
    await pick([jpeg()]);
    expect(await screen.findByText('Nu mă pot conecta la server. Verifică internetul și încearcă din nou.')).toBeInTheDocument();
    expect(screen.getByText('Încearcă din nou sau șterge paginile cu eroare.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    expect(await screen.findByText('Încărcat')).toBeInTheDocument();
    expect(api.uploadFile).toHaveBeenCalledTimes(2);
    // The second try sends the file prepared by the first one.
    expect(keepAsIs).toHaveBeenCalledTimes(1);
  });

  it('deletes a sent page on the server', async () => {
    const { api } = setup();
    await pick([jpeg('a.jpg'), jpeg('b.jpg')]);
    await pages(api, 2);
    await userEvent.click(screen.getByRole('button', { name: 'Șterge pagina 1' }));
    await waitFor(() => expect(screen.queryByText('a.jpg')).not.toBeInTheDocument());
    expect(api.deleteFile).toHaveBeenCalledWith(LINK_TOKEN, 'secret-11', 100);
    expect(screen.getByText('b.jpg')).toBeInTheDocument();
  });

  it('sends everything after the student confirms, and forgets the secret', async () => {
    localStorage.setItem(`qe.session.${LINK_TOKEN}.11`, 'secret-11');
    const { api, onSent } = setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await pick([jpeg(), pdf()]);
    await pages(api, 2);
    await userEvent.click(screen.getByRole('button', { name: 'Am trimis tot' }));
    expect(api.confirm).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Am trimis tot' }));
    expect(confirm).toHaveBeenLastCalledWith('Ești sigur? După confirmare nu mai poți schimba nimic.');
    await waitFor(() => expect(onSent).toHaveBeenCalledWith(2));
    expect(localStorage.getItem(`qe.session.${LINK_TOKEN}.11`)).toBeNull();
  });

  it('goes back to the names when the teacher reset the upload', async () => {
    const { api, onLost } = setup();
    api.dropSession(11);
    await pick([jpeg()]);
    await waitFor(() => expect(onLost).toHaveBeenCalledWith('Încărcarea nu mai este valabilă. Alege-ți din nou numele.'));
  });

  it('shows the pages sent before a reload, with photo previews from the server', async () => {
    const files = [
      { id: 7, name: 'IMG_0001.jpg', contentType: 'image/jpeg', size: 900, position: 1 },
      { id: 8, name: 'scan.pdf', contentType: 'application/pdf', size: 2000, position: 2 },
    ];
    const { api } = setup(files);
    expect(await screen.findByRole('img', { name: 'Pagina 1' })).toHaveAttribute('src', 'blob:preview');
    expect(api.fileBlob).toHaveBeenCalledTimes(1);
    expect(api.fileBlob).toHaveBeenCalledWith(LINK_TOKEN, 'secret-11', 7);
    expect(screen.getAllByText('Încărcat')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Am trimis tot' })).toBeEnabled();
  });

  it('opens a photo on the whole screen and closes it with Escape', async () => {
    const { api } = setup();
    await pick([jpeg()]);
    await pages(api, 1);
    await userEvent.click(screen.getByRole('button', { name: 'Vezi pagina 1' }));
    const viewer = screen.getByRole('dialog', { name: 'Pagina 1' });
    expect(within(viewer).getByRole('button', { name: 'Închide' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expectNoGradingWords();
  });
});
