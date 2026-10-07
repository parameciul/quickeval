import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../ui/ApiError.ts';
import { createFakeUploadApi, LINK_TOKEN, linkInfo } from '../test/fakeUploadApi.ts';
import { expectNoGradingWords } from '../test/gradingWords.ts';
import { saveSecret } from './session.ts';
import { UploadApp } from './UploadApp.tsx';

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
  });

  it('shows the server message when another phone holds the upload', async () => {
    const api = createFakeUploadApi();
    api.seedSession(11);
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pop Ion' }));
    await userEvent.click(screen.getByRole('button', { name: 'Da, încep' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Încărcarea a început pe alt telefon. Roagă profesorul să o reseteze.');
    expect(screen.getByRole('heading', { name: 'Alege-ți numele' })).toBeInTheDocument();
  });

  it('goes straight back to an upload this phone started', async () => {
    const api = createFakeUploadApi();
    api.seedSession(11);
    saveSecret(LINK_TOKEN, 11, 'secret-11');
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByRole('heading', { name: 'Pop Ion' })).toBeInTheDocument();
    expect(api.startSession).toHaveBeenCalledWith(LINK_TOKEN, 11, 'secret-11');
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
  });

  it('shows the server message for an unknown link', async () => {
    const api = createFakeUploadApi();
    api.getLink.mockRejectedValueOnce(new ApiError(404, 'unknown_link', 'Link greșit. Cere profesorului linkul nou.'));
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Link greșit. Cere profesorului linkul nou.');
  });
});
