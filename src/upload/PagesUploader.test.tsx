import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubmissionFile } from '../../shared/api.ts';
import { ApiError } from '../ui/ApiError.ts';
import { PagesUploader, type PagesApi } from './PagesUploader.tsx';

const jpeg = (name: string) => new File([new Uint8Array(10)], name, { type: 'image/jpeg' });
const keepAsIs = async (file: File) => file as Blob;
const file = (id: number, name: string): SubmissionFile => ({ id, name, contentType: 'application/pdf', size: 5, position: id });

function fakePages() {
  let nextId = 300;
  return {
    uploadFile: vi.fn(async (blob: Blob, name: string, onProgress: (sent: number) => void): Promise<SubmissionFile> => {
      onProgress(1);
      return { id: nextId++, name, contentType: blob.type, size: blob.size, position: 1 };
    }),
    deleteFile: vi.fn(async (_fileId: number) => undefined),
    fileBlob: vi.fn(async (_fileId: number) => new Blob(['jpg'], { type: 'image/jpeg' })),
  } satisfies PagesApi;
}

function setup(files: SubmissionFile[] = [], onFinish: (count: number) => Promise<void> | void = vi.fn()) {
  const pages = fakePages();
  const onLost = vi.fn();
  render(
    <PagesUploader
      pages={pages}
      files={files}
      heading={<h1>Lucrarea elevului</h1>}
      listTitle="Paginile"
      finishLabel="Am terminat"
      onFinish={onFinish}
      onLost={onLost}
      shrink={keepAsIs}
    />,
  );
  return { pages, onLost, onFinish };
}

const pick = (files: File[]) => userEvent.upload(screen.getByLabelText('Alege fișiere'), files);

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:preview'), configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PagesUploader', () => {
  it('shows the heading, the list title with its count, and the finish label', () => {
    setup([file(1, 'a.pdf'), file(2, 'b.pdf')]);
    expect(screen.getByRole('heading', { name: 'Lucrarea elevului' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Paginile (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Am terminat' })).toBeEnabled();
  });

  it('sends picked files one at a time in order and calls onFinish with the count', async () => {
    const onFinish = vi.fn();
    const { pages } = setup([], onFinish);
    await pick([jpeg('a.jpg'), jpeg('b.jpg')]);
    await waitFor(() => expect(screen.getAllByText('Încărcat')).toHaveLength(2));
    expect(pages.uploadFile.mock.calls.map((call) => call[1])).toEqual(['a.jpg', 'b.jpg']);
    await userEvent.click(screen.getByRole('button', { name: 'Am terminat' }));
    expect(onFinish).toHaveBeenCalledWith(2);
  });

  it("shows a refused page's message and still sends the next page", async () => {
    const { pages } = setup();
    pages.uploadFile.mockRejectedValueOnce(new ApiError(409, 'too_many_files', 'Poți trimite cel mult 20 de fișiere.'));
    await pick([jpeg('a.jpg'), jpeg('b.jpg')]);
    expect(await screen.findByText('Poți trimite cel mult 20 de fișiere.')).toBeInTheDocument();
    await waitFor(() => expect(pages.uploadFile).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Încărcat')).toBeInTheDocument();
  });

  it('shows no retry button for a page the server refused for good', async () => {
    const { pages } = setup();
    pages.uploadFile.mockRejectedValueOnce(new ApiError(409, 'paper_sent', 'Lucrarea a plecat deja la corectare.'));
    await pick([jpeg('a.jpg')]);
    expect(await screen.findByText('Lucrarea a plecat deja la corectare.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Încearcă din nou' })).not.toBeInTheDocument();

    pages.uploadFile.mockRejectedValueOnce(new ApiError(0, 'network', 'Nu mă pot conecta la server.'));
    await pick([jpeg('b.jpg')]);
    expect(await screen.findByText('Nu mă pot conecta la server.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Încearcă din nou' })).toBeInTheDocument();
  });

  it('calls onLost for a 401 and sends nothing after it', async () => {
    const { pages, onLost } = setup();
    pages.uploadFile.mockRejectedValueOnce(new ApiError(401, 'no_session', 'Linkul nu mai este valabil.'));
    await pick([jpeg('a.jpg'), jpeg('b.jpg')]);
    await waitFor(() => expect(onLost).toHaveBeenCalledWith('Linkul nu mai este valabil.'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pages.uploadFile).toHaveBeenCalledTimes(1);
  });

  it('shows what onFinish throws as a notice and enables the button again', async () => {
    const onFinish = vi.fn(async () => {
      throw new ApiError(409, 'closed', 'Testul s-a închis.');
    });
    setup([file(1, 'a.pdf')], onFinish);
    await userEvent.click(screen.getByRole('button', { name: 'Am terminat' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Testul s-a închis.');
    expect(screen.getByRole('button', { name: 'Am terminat' })).toBeEnabled();
  });
});
