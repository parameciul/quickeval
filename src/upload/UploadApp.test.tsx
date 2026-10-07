import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../ui/ApiError.ts';
import { createFakeUploadApi, LINK_TOKEN, linkInfo } from '../test/fakeUploadApi.ts';
import { expectNoGradingWords } from '../test/gradingWords.ts';
import { saveSecret } from './session.ts';
import { UploadApp } from './UploadApp.tsx';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('UploadApp', () => {
  it('shows the test and the class list, with ✓ for students who already sent', async () => {
    const api = createFakeUploadApi();
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByRole('heading', { name: 'Fracții' })).toBeInTheDocument();
    expect(screen.getByText('Clasa 6E2 · 6E2-26T1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pop Ion' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Stan Eva, a trimis' })).toBeDisabled();
    expectNoGradingWords();
  });

  it('starts the upload after the student confirms the name, and keeps the secret', async () => {
    const api = createFakeUploadApi();
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pop Ion' }));
    expect(screen.getByRole('heading', { name: 'Ești Pop Ion?' })).toBeInTheDocument();
    expectNoGradingWords();
    await userEvent.click(screen.getByRole('button', { name: 'Da, încep' }));
    expect(api.startSession).toHaveBeenCalledWith(LINK_TOKEN, 11, null);
    expect(await screen.findByRole('heading', { name: 'Pop Ion' })).toBeInTheDocument();
    expect(localStorage.getItem(`qe.session.${LINK_TOKEN}.11`)).toBe('secret-11');
  });

  it('goes back to the list when the student says it is not their name', async () => {
    const api = createFakeUploadApi();
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pop Ion' }));
    await userEvent.click(screen.getByRole('button', { name: 'Nu, aleg alt nume' }));
    expect(screen.getByRole('heading', { name: 'Alege-ți numele' })).toBeInTheDocument();
    expect(api.startSession).not.toHaveBeenCalled();
    expectNoGradingWords();
  });

  it('shows the server message when another phone holds the upload', async () => {
    const api = createFakeUploadApi();
    api.seedSession(11);
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pop Ion' }));
    await userEvent.click(screen.getByRole('button', { name: 'Da, încep' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Încărcarea a început pe alt telefon. Roagă profesorul să o reseteze.');
    expect(screen.getByRole('heading', { name: 'Alege-ți numele' })).toBeInTheDocument();
    expectNoGradingWords();
  });

  it('goes straight back to an upload this phone started', async () => {
    const api = createFakeUploadApi();
    api.seedSession(11);
    saveSecret(LINK_TOKEN, 11, 'secret-11');
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByRole('heading', { name: 'Pop Ion' })).toBeInTheDocument();
    expect(api.startSession).toHaveBeenCalledWith(LINK_TOKEN, 11, 'secret-11');
    expectNoGradingWords();
  });

  it('lets a student on a shared phone leave an upload that is not theirs', async () => {
    const api = createFakeUploadApi();
    api.seedSession(11);
    saveSecret(LINK_TOKEN, 11, 'secret-11');
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByRole('heading', { name: 'Pop Ion' })).toBeInTheDocument();
    expect(screen.getByText(/Nu ești Pop Ion\?/)).toBeInTheDocument();
    expectNoGradingWords();
    await userEvent.click(screen.getByRole('button', { name: 'Alege alt nume' }));
    expect(screen.getByRole('heading', { name: 'Alege-ți numele' })).toBeInTheDocument();
    expect(api.startSession).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(`qe.session.${LINK_TOKEN}.11`)).toBe('secret-11');
    expectNoGradingWords();
  });

  it('says the uploads are closed once the test is closed', async () => {
    const api = createFakeUploadApi({ ...linkInfo({ status: 'evaluating' }), students: [] });
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Încărcarea s-a închis.');
    expect(screen.queryByRole('heading', { name: 'Alege-ți numele' })).not.toBeInTheDocument();
    expectNoGradingWords();
  });

  it('shows a wrong-link message for an address without a valid token, without asking the server', async () => {
    const api = createFakeUploadApi();
    render(<UploadApp api={api} token={null} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Link greșit. Cere profesorului linkul nou.');
    expect(api.getLink).not.toHaveBeenCalled();
    expectNoGradingWords();
  });

  it('sends a page from start to end and says the work was sent', async () => {
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:preview'), configurable: true });
    const api = createFakeUploadApi();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pop Ion' }));
    await userEvent.click(screen.getByRole('button', { name: 'Da, încep' }));
    await userEvent.upload(await screen.findByLabelText('Alege fișiere'), new File(['%PDF-1.7'], 'scan.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText('Încărcat')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Am trimis tot' }));
    expect(await screen.findByRole('heading', { name: 'Gata! Lucrarea ta a fost trimisă.' })).toBeInTheDocument();
    expect(screen.getByText('Ai trimis un fișier.')).toBeInTheDocument();
    expectNoGradingWords();
  });

  it('goes back to the names, with the reason, when the teacher reset the upload', async () => {
    const api = createFakeUploadApi();
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pop Ion' }));
    await userEvent.click(screen.getByRole('button', { name: 'Da, încep' }));
    await screen.findByLabelText('Alege fișiere');
    api.dropSession(11);
    await userEvent.upload(screen.getByLabelText('Alege fișiere'), new File(['%PDF-1.7'], 'scan.pdf', { type: 'application/pdf' }));
    expect(await screen.findByRole('heading', { name: 'Alege-ți numele' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Încărcarea nu mai este valabilă. Alege-ți din nou numele.');
    expectNoGradingWords();
  });

  it('shows the server message for an unknown link', async () => {
    const api = createFakeUploadApi();
    api.getLink.mockRejectedValueOnce(new ApiError(404, 'unknown_link', 'Link greșit. Cere profesorului linkul nou.'));
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Link greșit. Cere profesorului linkul nou.');
    expectNoGradingWords();
  });
});
