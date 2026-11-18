import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../ui/ApiError.ts';
import { createFakeUploadApi, LINK_TOKEN, linkInfo } from '../test/fakeUploadApi.ts';
import { expectNoGradingWords } from '../test/gradingWords.ts';
import { saveResultLink } from './resultLinks.ts';
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

  it('shows the site header, with only the site links, and no footer', async () => {
    const api = createFakeUploadApi();
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByRole('heading', { name: 'Fracții' })).toBeInTheDocument();
    const banner = screen.getByRole('banner');
    expect(banner).toHaveTextContent('MQGrader');
    expect(banner).toHaveTextContent('by Laura Miron');
    expect(within(banner).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      'https://mqgrader.ro/',
      'https://mqgrader.ro/about/',
    ]);
    expect(within(banner).getByRole('button', { name: 'Temă întunecată' })).toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    expect(screen.queryByText(/Profesorul tău folosește|Încearcă gratuit|Ești profesor/)).not.toBeInTheDocument();
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
    expect(api.releaseSession).toHaveBeenCalledWith(LINK_TOKEN, 'secret-11');
    expect(localStorage.getItem(`qe.session.${LINK_TOKEN}.11`)).toBeNull();
    expectNoGradingWords();
  });

  it('frees the name of an empty upload, so the right student can take it', async () => {
    const api = createFakeUploadApi();
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pop Ion' }));
    await userEvent.click(screen.getByRole('button', { name: 'Da, încep' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Alege alt nume' }));
    expect(await screen.findByRole('heading', { name: 'Alege-ți numele' })).toBeInTheDocument();
    // The name is free again: another phone can start it.
    await expect(api.startSession(LINK_TOKEN, 11, null)).resolves.toMatchObject({ secret: expect.any(String) });
  });

  it('keeps the name locked when the upload has files', async () => {
    const api = createFakeUploadApi();
    api.seedSession(11, [{ id: 1, name: 'p.jpg', contentType: 'image/jpeg', size: 1, position: 1 }]);
    saveSecret(LINK_TOKEN, 11, 'secret-11');
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Alege alt nume' }));
    expect(await screen.findByRole('heading', { name: 'Alege-ți numele' })).toBeInTheDocument();
    expect(api.releaseSession).toHaveBeenCalled();
    expect(localStorage.getItem(`qe.session.${LINK_TOKEN}.11`)).toBe('secret-11');
    await expect(api.startSession(LINK_TOKEN, 11, null)).rejects.toMatchObject({ code: 'other_device' });
  });

  it('forgets a secret of an upload that moved to another phone, without an alert', async () => {
    const api = createFakeUploadApi();
    api.seedSession(11);
    saveSecret(LINK_TOKEN, 11, 'old-secret');
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByRole('heading', { name: 'Alege-ți numele' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(localStorage.getItem(`qe.session.${LINK_TOKEN}.11`)).toBeNull();
    expectNoGradingWords();
  });

  it('says the uploads are closed once the test is closed, in a calm grey box, not as an error', async () => {
    const api = createFakeUploadApi({ ...linkInfo({ status: 'evaluating' }), students: [] });
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    const notice = await screen.findByRole('status');
    // All of it in the one box: no word on results for a phone that sent nothing.
    expect(notice).toHaveTextContent(/^Încărcarea s-a închis\.\s*Dacă nu ai trimis lucrarea, spune-i profesorului\.$/);
    expect(notice).toHaveClass('notice');
    expect(screen.queryByText(/Rezultat/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Revino/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Alege-ți numele' })).not.toBeInTheDocument();
    expectNoGradingWords();
  });

  it('says the uploads are closed while the teacher closed them on an open test, with no names', async () => {
    const api = createFakeUploadApi({ ...linkInfo({ status: 'open', uploadsClosed: true }), students: [] });
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent(/^Încărcarea s-a închis\.\s*Dacă nu ai trimis lucrarea, spune-i profesorului\.$/);
    expect(screen.queryByRole('heading', { name: 'Alege-ți numele' })).not.toBeInTheDocument();
    expectNoGradingWords();
  });

  it('says only that an archived test is archived when this phone sent nothing', async () => {
    const api = createFakeUploadApi({ ...linkInfo({ status: 'done', archived: true }), students: [] });
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('Testul a fost arhivat. Dacă ai nevoie de ceva, întreabă profesorul.');
    expect(notice).toHaveClass('notice');
    expect(screen.queryByText(/Încărcarea s-a închis/)).not.toBeInTheDocument();
    expectNoGradingWords();
  });

  it('says the test has not started for a printed QR code scanned before the start, and checks again on demand', async () => {
    const draft = { ...linkInfo({ status: 'draft' }), students: [] };
    const api = createFakeUploadApi(draft);
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Testul nu a început încă.');
    expect(screen.getByText('Poți încărca lucrarea după ce îl începe profesorul.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Alege-ți numele' })).not.toBeInTheDocument();
    expectNoGradingWords();

    // The teacher starts the test: the next check shows the names.
    api.getLink.mockResolvedValueOnce(linkInfo());
    await userEvent.click(screen.getByRole('button', { name: 'Verifică din nou' }));
    expect(await screen.findByRole('button', { name: 'Pop Ion' })).toBeInTheDocument();
    expect(screen.queryByText('Testul nu a început încă.')).not.toBeInTheDocument();
    expectNoGradingWords();
  });

  it('shows the not-started screen when the teacher stopped the test while the names were on screen', async () => {
    const api = createFakeUploadApi();
    api.startSession.mockRejectedValueOnce(
      new ApiError(409, 'not_started', 'Testul nu a început încă. Poți încărca lucrarea după ce îl începe profesorul.'),
    );
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pop Ion' }));
    await userEvent.click(screen.getByRole('button', { name: 'Da, încep' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Testul nu a început încă.');
    expect(screen.getByRole('button', { name: 'Verifică din nou' })).toBeInTheDocument();
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

  it('keeps the result link after sending and shows it on the sent screen', async () => {
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
    expect(screen.getByRole('link', { name: 'Vezi rezultatul' })).toHaveAttribute('href', `${window.location.origin}/u/result/result-token-11`);
    // The ticket: a screenshot of it holds the QR code and the short code.
    const ticket = screen.getByRole('region', { name: 'Biletul pentru rezultat: Pop Ion' });
    expect(within(ticket).getByText('Fracții')).toBeInTheDocument();
    expect(within(ticket).getByTitle('Codul QR al rezultatului')).toBeInTheDocument();
    expect(within(ticket).getByText('K7M-92P')).toBeInTheDocument();
    // The whole address is text on the page (not cut off in a field), one tap away.
    await userEvent.click(within(ticket).getByRole('button', { name: 'Arată linkul întreg' }));
    expect(screen.getByText(`${window.location.origin}/u/result/result-token-11`)).toHaveClass('result-link-url');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    // What to do with the ticket, in the green box; no long text under the buttons.
    expect(screen.getByText('Ai trimis un fișier.')).toBeInTheDocument();
    expect(screen.getByText('Salvează biletul de mai jos sau trimite-ți linkul. Cu ele îți vezi rezultatul după ce profesorul corectează și publică lucrarea.').closest('.sent')).not.toBeNull();
    expect(screen.queryByText(/^Rezultatul apare/)).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(`qe.result.${LINK_TOKEN}.11`)!)).toEqual({ resultToken: 'result-token-11', studentName: 'Pop Ion', resultCode: 'K7M92P' });
    expectNoGradingWords();
  });

  it('shows the kept result link when the same upload link opens again after closing', async () => {
    const api = createFakeUploadApi({ ...linkInfo({ status: 'evaluating' }), students: [] });
    saveSecret(LINK_TOKEN, 11, 'secret-11');
    saveResultLink(LINK_TOKEN, 11, 'result-token-11', 'Pop Ion', 'K7M92P');
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    // The ticket means the work went: the green box says so, and what to do with it.
    const notice = await screen.findByRole('status');
    expect(notice).toHaveClass('sent');
    expect(within(notice).getByRole('heading', { name: 'Lucrarea ta a fost trimisă.' })).toBeInTheDocument();
    expect(within(notice).getByText('Salvează biletul de mai jos sau trimite-ți linkul. Cu ele îți vezi rezultatul după ce profesorul corectează și publică lucrarea.')).toBeInTheDocument();
    expect(screen.queryByText(/Încărcarea s-a închis/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Dacă nu ai trimis lucrarea/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Revino pe acest link/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vezi rezultatul' })).toHaveAttribute('href', `${window.location.origin}/u/result/result-token-11`);
    const ticket = screen.getByRole('region', { name: 'Biletul pentru rezultat: Pop Ion' });
    expect(within(ticket).getByText('K7M-92P')).toBeInTheDocument();
    // Before the publish: the ticket to save, and no code field.
    expect(screen.queryByLabelText('Scrie codul tău')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Am alt cod' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Alege-ți numele' })).not.toBeInTheDocument();
    expectNoGradingWords();
  });

  it('says where the result is when the results are published and this phone kept no link', async () => {
    const api = createFakeUploadApi({ ...linkInfo({ status: 'done', resultsOpen: true }), students: [] });
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByText('Rezultatele au fost publicate.')).toBeInTheDocument();
    expect(screen.getByText('Deschide linkul testului pe telefonul cu care ai trimis lucrarea.')).toBeInTheDocument();
    expect(screen.getByText('Dacă nu găsești nimic, cere profesorului codul tău.')).toBeInTheDocument();
    // Nothing went wrong: no error, and no word of the closed uploads.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Încărcarea s-a închis.')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Vezi rezultatul' })).not.toBeInTheDocument();
    expect(api.getLink).toHaveBeenCalledTimes(1);
    expectNoGradingWords();
  });

  it('opens the kept result at once, in place of the page, once the results are published', async () => {
    const api = createFakeUploadApi({ ...linkInfo({ status: 'done', resultsOpen: true }), students: [] });
    saveResultLink(LINK_TOKEN, 11, 'result-token-11', 'Pop Ion', 'K7M92P');
    const goTo = vi.fn();
    const openResult = vi.fn();
    render(<UploadApp api={api} token={LINK_TOKEN} goTo={goTo} openResult={openResult} />);
    await vi.waitFor(() => expect(openResult).toHaveBeenCalledWith('/u/result/result-token-11'));
    expect(openResult).toHaveBeenCalledTimes(1);
    expect(goTo).not.toHaveBeenCalled();
    // Only whether it is published: the result page reads the result itself.
    expect(api.resultPublished).toHaveBeenCalledWith('result-token-11');
    expect(api.getResult).not.toHaveBeenCalled();
    // No ticket, code or link to read: the result is on its way.
    expect(screen.getByText('Se deschide rezultatul…')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /^Biletul pentru rezultat/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Rezultatele au fost publicate.')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expectNoGradingWords();
  });

  it('asks for the code, with no ticket, when this phone kept the links of several papers', async () => {
    const api = createFakeUploadApi({ ...linkInfo({ status: 'done', resultsOpen: true }), students: [] });
    saveResultLink(LINK_TOKEN, 11, 'result-token-11', 'Pop Ion', 'K7M92P');
    saveResultLink(LINK_TOKEN, 12, 'result-token-12', 'Stan Eva', 'ABC234');
    const openResult = vi.fn();
    render(<UploadApp api={api} token={LINK_TOKEN} openResult={openResult} />);
    expect(await screen.findByText('Rezultatele au fost publicate.')).toBeInTheDocument();
    expect(screen.getByLabelText('Scrie codul tău')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /^Biletul pentru rezultat/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Vezi rezultatul' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Am alt cod' })).not.toBeInTheDocument();
    expect(openResult).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expectNoGradingWords();
  });

  it('opens nothing before the results are published', async () => {
    const api = createFakeUploadApi({ ...linkInfo({ status: 'done' }), students: [] });
    saveResultLink(LINK_TOKEN, 11, 'result-token-11', 'Pop Ion', 'K7M92P');
    const openResult = vi.fn();
    render(<UploadApp api={api} token={LINK_TOKEN} openResult={openResult} />);
    expect(await screen.findByRole('status')).toHaveTextContent('Lucrarea ta a fost trimisă.');
    expect(screen.getByRole('region', { name: 'Biletul pentru rezultat: Pop Ion' })).toBeInTheDocument();
    expect(screen.queryByText('Rezultatul tău nu a fost publicat încă.')).not.toBeInTheDocument();
    expect(openResult).not.toHaveBeenCalled();
    expect(api.resultPublished).not.toHaveBeenCalled();
  });

  it('keeps the ticket and opens nothing when other results are published but not the one this phone sent', async () => {
    const api = createFakeUploadApi({ ...linkInfo({ status: 'done', resultsOpen: true }), students: [] });
    api.resultPublished.mockResolvedValue(false);
    saveResultLink(LINK_TOKEN, 11, 'result-token-11', 'Pop Ion', 'K7M92P');
    const openResult = vi.fn();
    render(<UploadApp api={api} token={LINK_TOKEN} openResult={openResult} />);
    expect(await screen.findByRole('region', { name: 'Biletul pentru rezultat: Pop Ion' })).toBeInTheDocument();
    expect(api.resultPublished).toHaveBeenCalledWith('result-token-11');
    const notice = screen.getByRole('status');
    expect(notice).toHaveClass('sent');
    expect(notice).toHaveTextContent('Lucrarea ta a fost trimisă.');
    // Classmates may have their results: this line says why this one does not open.
    expect(within(notice).getByText('Rezultatul tău nu a fost publicat încă.')).toBeInTheDocument();
    expect(within(notice).getByText('Salvează biletul de mai jos sau trimite-ți linkul. Cu ele îți vezi rezultatul după ce profesorul corectează și publică lucrarea.')).toBeInTheDocument();
    expect(screen.queryByText('Rezultatele au fost publicate.')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Scrie codul tău')).not.toBeInTheDocument();
    expect(openResult).not.toHaveBeenCalled();
    expectNoGradingWords();
  });

  it('forgets a kept link the server no longer knows and asks for the code, with no error', async () => {
    const api = createFakeUploadApi({ ...linkInfo({ status: 'done', resultsOpen: true }), students: [] });
    api.resultPublished.mockRejectedValue(new ApiError(404, 'unknown_link', 'Link greșit. Cere profesorului linkul nou.'));
    saveResultLink(LINK_TOKEN, 11, 'result-token-11', 'Pop Ion', 'K7M92P');
    const openResult = vi.fn();
    render(<UploadApp api={api} token={LINK_TOKEN} openResult={openResult} />);
    expect(await screen.findByLabelText('Scrie codul tău')).toBeInTheDocument();
    expect(screen.getByText('Rezultatele au fost publicate.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(openResult).not.toHaveBeenCalled();
    expect(localStorage.getItem(`qe.result.${LINK_TOKEN}.11`)).toBeNull();
  });

  it('opens the result when the phone also kept a link of another test', async () => {
    const closed = { ...linkInfo({ status: 'done', resultsOpen: true }), students: [] };
    const api = createFakeUploadApi(closed);
    saveResultLink(LINK_TOKEN, 11, 'result-token-11', 'Pop Ion', 'K7M92P');
    saveResultLink('otherlinktoken22', 11, 'result-token-99', 'Pop Ion', 'XYZ234');
    api.getLink.mockImplementation(async (asked: string) => {
      const info = structuredClone(closed);
      if (asked === 'otherlinktoken22') info.test.key = 'test-key-2';
      return info;
    });
    const openResult = vi.fn();
    render(<UploadApp api={api} token={LINK_TOKEN} openResult={openResult} />);
    await vi.waitFor(() => expect(openResult).toHaveBeenCalledWith('/u/result/result-token-11'));
    expect(openResult).toHaveBeenCalledTimes(1);
  });

  it('says an archived test closed its results, in place of waiting for them', async () => {
    const api = createFakeUploadApi({ ...linkInfo({ status: 'done', archived: true }), students: [] });
    saveResultLink(LINK_TOKEN, 11, 'result-token-11', 'Pop Ion', 'K7M92P');
    render(<UploadApp api={api} token={LINK_TOKEN} openResult={vi.fn()} />);
    const notice = await screen.findByRole('status');
    expect(notice).toHaveClass('notice');
    expect(notice).toHaveTextContent('Testul a fost arhivat și rezultatele nu mai sunt disponibile. Dacă ai nevoie de rezultat, întreabă profesorul.');
    // Results that may never open: no ticket, whose picture promises a result.
    expect(screen.queryByText(/^Salvează biletul de mai jos/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Revino pe acest link/)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /^Biletul pentru rezultat/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvează biletul' })).not.toBeInTheDocument();
    expectNoGradingWords();
  });

  it('says the archived test closed its results also when the teacher published a few of them, but not this one', async () => {
    const api = createFakeUploadApi({ ...linkInfo({ status: 'done', archived: true, resultsOpen: true }), students: [] });
    api.resultPublished.mockResolvedValue(false);
    saveResultLink(LINK_TOKEN, 11, 'result-token-11', 'Pop Ion', 'K7M92P');
    const openResult = vi.fn();
    render(<UploadApp api={api} token={LINK_TOKEN} openResult={openResult} />);
    expect(await screen.findByText('Testul a fost arhivat și rezultatele nu mai sunt disponibile. Dacă ai nevoie de rezultat, întreabă profesorul.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /^Biletul pentru rezultat/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Rezultatul tău nu a fost publicat încă.')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Salvează biletul de mai jos/)).not.toBeInTheDocument();
    expect(openResult).not.toHaveBeenCalled();
  });

  it('opens the result of an archived test when the teacher published it', async () => {
    const api = createFakeUploadApi({ ...linkInfo({ status: 'done', archived: true, resultsOpen: true }), students: [] });
    saveResultLink(LINK_TOKEN, 11, 'result-token-11', 'Pop Ion', 'K7M92P');
    const openResult = vi.fn();
    render(<UploadApp api={api} token={LINK_TOKEN} openResult={openResult} />);
    await vi.waitFor(() => expect(openResult).toHaveBeenCalledWith('/u/result/result-token-11'));
  });

  it('opens the result anyway when the check fails for another reason, so the result page says what is wrong', async () => {
    const api = createFakeUploadApi({ ...linkInfo({ status: 'done', resultsOpen: true }), students: [] });
    api.resultPublished.mockRejectedValue(new ApiError(0, 'network', 'Nu am putut ajunge la server.'));
    saveResultLink(LINK_TOKEN, 11, 'result-token-11', 'Pop Ion', 'K7M92P');
    const openResult = vi.fn();
    render(<UploadApp api={api} token={LINK_TOKEN} openResult={openResult} />);
    await vi.waitFor(() => expect(openResult).toHaveBeenCalledWith('/u/result/result-token-11'));
    // The link stays: only a link the server does not know is forgotten.
    expect(localStorage.getItem(`qe.result.${LINK_TOKEN}.11`)).not.toBeNull();
  });

  it('opens nothing when the page closes while it checks the result', async () => {
    const api = createFakeUploadApi({ ...linkInfo({ status: 'done', resultsOpen: true }), students: [] });
    let answer: (published: boolean) => void = () => {};
    api.resultPublished.mockImplementation(() => new Promise<boolean>((resolve) => (answer = resolve)));
    saveResultLink(LINK_TOKEN, 11, 'result-token-11', 'Pop Ion', 'K7M92P');
    const openResult = vi.fn();
    const page = render(<UploadApp api={api} token={LINK_TOKEN} openResult={openResult} />);
    await vi.waitFor(() => expect(api.resultPublished).toHaveBeenCalled());
    page.unmount();
    answer(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(openResult).not.toHaveBeenCalled();
  });

  it('does not lock the default link for a link an older page kept for a typed code', async () => {
    // What the page wrote before it stopped keeping such links.
    localStorage.setItem(
      `qe.result.${LINK_TOKEN}.11`,
      JSON.stringify({ resultToken: 'result-token-11', studentName: 'Pop Ion', resultCode: 'K7M92P', byCode: true }),
    );
    render(<UploadApp api={createFakeUploadApi()} token={LINK_TOKEN} />);
    expect(await screen.findByRole('button', { name: 'Ionescu Ana' })).toBeEnabled();
    expect(screen.queryByText(/Cu acest link nu mai poți trimite/)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /^Biletul pentru rezultat/ })).not.toBeInTheDocument();
  });

  it('opens a result this phone kept through the other link of the test, and asks for that link only once', async () => {
    const other = 'multilinktoken22';
    const closed = { ...linkInfo({ status: 'done', resultsOpen: true }), students: [] };
    const api = createFakeUploadApi(closed);
    // The paper went through the link for many uploads, before the phone
    // remembered which test a link belongs to.
    saveResultLink(other, 11, 'result-token-11', 'Pop Ion');
    const openResult = vi.fn();
    const first = render(<UploadApp api={api} token={LINK_TOKEN} openResult={openResult} />);
    await vi.waitFor(() => expect(openResult).toHaveBeenCalledWith('/u/result/result-token-11'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.getLink.mock.calls.map(([asked]) => asked)).toEqual([LINK_TOKEN, other]);
    expectNoGradingWords();

    first.unmount();
    api.getLink.mockClear();
    openResult.mockClear();
    render(<UploadApp api={api} token={LINK_TOKEN} openResult={openResult} />);
    await vi.waitFor(() => expect(openResult).toHaveBeenCalledWith('/u/result/result-token-11'));
    expect(api.getLink.mock.calls.map(([asked]) => asked)).toEqual([LINK_TOKEN]);
  });

  it('shows the ticket of a link kept before links had codes with the QR code and no code row', async () => {
    const api = createFakeUploadApi({ ...linkInfo({ status: 'done' }), students: [] });
    saveResultLink('multilinktoken22', 11, 'result-token-11', 'Pop Ion');
    render(<UploadApp api={api} token={LINK_TOKEN} openResult={vi.fn()} />);
    const ticket = await screen.findByRole('region', { name: 'Biletul pentru rezultat: Pop Ion' });
    expect(within(ticket).getByTitle('Codul QR al rezultatului')).toBeInTheDocument();
    expect(within(ticket).queryByText('Codul tău')).not.toBeInTheDocument();
  });

  it('shows no result link kept for another test, or for a link the server no longer knows', async () => {
    const closed = { ...linkInfo({ status: 'done', resultsOpen: true }), students: [] };
    const api = createFakeUploadApi(closed);
    saveResultLink('otherlinktoken22', 11, 'result-token-11', 'Pop Ion');
    saveResultLink('deadlinktoken222', 12, 'result-token-12', 'Stan Eva');
    api.getLink.mockImplementation(async (asked: string) => {
      if (asked === 'deadlinktoken222') throw new ApiError(404, 'unknown_link', 'Link greșit. Cere profesorului linkul nou.');
      const info = structuredClone(closed);
      if (asked === 'otherlinktoken22') info.test.key = 'test-key-2';
      return info;
    });
    const first = render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByText(/cere profesorului codul tău/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Vezi rezultatul' })).not.toBeInTheDocument();
    expect(api.getLink).toHaveBeenCalledTimes(3);

    // Neither is asked for again.
    first.unmount();
    api.getLink.mockClear();
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByText(/cere profesorului codul tău/)).toBeInTheDocument();
    expect(api.getLink).toHaveBeenCalledTimes(1);
  });

  it('still shows the closed page when the other link cannot be asked now', async () => {
    const closed = { ...linkInfo({ status: 'done', resultsOpen: true }), students: [] };
    const api = createFakeUploadApi(closed);
    saveResultLink('multilinktoken22', 11, 'result-token-11', 'Pop Ion');
    api.getLink.mockImplementation(async (asked: string) => {
      if (asked !== LINK_TOKEN) throw new ApiError(0, 'network', 'Nu am putut ajunge la server.');
      return structuredClone(closed);
    });
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByText('Rezultatele au fost publicate.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Not remembered as unknown: the next visit asks again.
    expect(localStorage.getItem('qe.link.multilinktoken22')).toBeNull();
  });

  it('asks for no other link while the uploads are open', async () => {
    const api = createFakeUploadApi(linkInfo({ multi: true }));
    saveResultLink('multilinktoken22', 12, 'result-token-12', 'Stan Eva');
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByRole('heading', { name: 'Alege-ți numele' })).toBeInTheDocument();
    expect(api.getLink).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(`qe.link.${LINK_TOKEN}`)).toBe('test-key-1');
  });

  it('locks the default link after one upload on this phone', async () => {
    const api = createFakeUploadApi();
    saveResultLink(LINK_TOKEN, 11, 'result-token-11', 'Pop Ion');
    // The server still shows the upload as sent.
    const info = linkInfo();
    info.students.find((s) => s.id === 11)!.state = 'done';
    api.getLink.mockResolvedValue(structuredClone(info));
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByRole('link', { name: 'Vezi rezultatul' })).toHaveAttribute(
      'href',
      `${window.location.origin}/u/result/result-token-11`,
    );
    expect(screen.queryByRole('heading', { name: 'Alege-ți numele' })).not.toBeInTheDocument();
    // The green box first, then the ticket, then one line on the locked link.
    const notice = screen.getByRole('status');
    expect(notice).toHaveClass('sent');
    expect(within(notice).getByRole('heading', { name: 'Lucrarea ta a fost trimisă.' })).toBeInTheDocument();
    expect(within(notice).getByText('Salvează biletul de mai jos sau trimite-ți linkul. Cu ele îți vezi rezultatul după ce profesorul corectează și publică lucrarea.')).toBeInTheDocument();
    const ticket = screen.getByRole('region', { name: 'Biletul pentru rezultat: Pop Ion' });
    expect(notice.compareDocumentPosition(ticket) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      screen.getByText('Cu acest link nu mai poți trimite altă lucrare. Pentru alt elev, cere profesorului linkul pentru mai multe încărcări.'),
    ).toBeInTheDocument();
    expectNoGradingWords();
  });

  it('unlocks the default link again after the teacher reset the upload', async () => {
    const api = createFakeUploadApi();
    saveResultLink(LINK_TOKEN, 11, 'result-token-11', 'Pop Ion');
    // The teacher reset the upload: the student is back in the list.
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByRole('heading', { name: 'Alege-ți numele' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Vezi rezultatul' })).not.toBeInTheDocument();
    expectNoGradingWords();
  });

  it('keeps the name list on the multi-upload link after one upload', async () => {
    const api = createFakeUploadApi(linkInfo({ multi: true }));
    saveResultLink(LINK_TOKEN, 11, 'result-token-11', 'Pop Ion');
    const info = linkInfo({ multi: true });
    info.students.find((s) => s.id === 11)!.state = 'done';
    api.getLink.mockResolvedValue(structuredClone(info));
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByRole('heading', { name: 'Alege-ți numele' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Biletul lucrării trimise de pe acest telefon' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vezi rezultatul' })).toHaveAttribute(
      'href',
      `${window.location.origin}/u/result/result-token-11`,
    );
    // The sent student cannot be picked again, but another one can.
    expect(screen.getByRole('button', { name: 'Pop Ion, a trimis' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ionescu Ana' })).toBeEnabled();
    expectNoGradingWords();
  });

  it('offers another upload after sending with the multi-upload link', async () => {
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:preview'), configurable: true });
    const api = createFakeUploadApi(linkInfo({ multi: true }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pop Ion' }));
    await userEvent.click(screen.getByRole('button', { name: 'Da, încep' }));
    await userEvent.upload(await screen.findByLabelText('Alege fișiere'), new File(['%PDF-1.7'], 'scan.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText('Încărcat')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Am trimis tot' }));
    expect(await screen.findByRole('heading', { name: 'Gata! Lucrarea ta a fost trimisă.' })).toBeInTheDocument();
    expectNoGradingWords();
    await userEvent.click(screen.getByRole('button', { name: 'Trimite pentru alt elev' }));
    expect(await screen.findByRole('heading', { name: 'Alege-ți numele' })).toBeInTheDocument();
    // Both the just-sent link and the name list are there for the next student.
    expect(screen.getAllByRole('link', { name: 'Vezi rezultatul' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Ionescu Ana' })).toBeEnabled();
    expectNoGradingWords();
  });
});
