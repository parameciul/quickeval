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
      'https://mqgrader.ro/despre/',
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

  it('says the uploads are closed once the test is closed', async () => {
    const api = createFakeUploadApi({ ...linkInfo({ status: 'evaluating' }), students: [] });
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Încărcarea s-a închis.');
    expect(screen.queryByRole('heading', { name: 'Alege-ți numele' })).not.toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: 'Vezi rezultatul' })).toHaveAttribute('href', `${window.location.origin}/u/rezultat/result-token-11`);
    // The ticket: a screenshot of it holds the QR code and the short code.
    const ticket = screen.getByRole('region', { name: 'Biletul pentru rezultat: Pop Ion' });
    expect(within(ticket).getByText('Fracții')).toBeInTheDocument();
    expect(within(ticket).getByTitle('Codul QR al rezultatului')).toBeInTheDocument();
    expect(within(ticket).getByText('K7M-92P')).toBeInTheDocument();
    // The whole address is text on the page (not cut off in a field), one tap away.
    await userEvent.click(within(ticket).getByRole('button', { name: 'Arată linkul întreg' }));
    expect(screen.getByText(`${window.location.origin}/u/rezultat/result-token-11`)).toHaveClass('result-link-url');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Rezultatul apare aici după ce profesorul publică rezultatele: nota, punctajul pe fiecare exercițiu, explicații detaliate pentru fiecare problemă rezolvată corect sau greșit și o sinteză finală cu ce merge bine și recomandări.')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(`qe.result.${LINK_TOKEN}.11`)!)).toEqual({ resultToken: 'result-token-11', studentName: 'Pop Ion', resultCode: 'K7M92P' });
    expectNoGradingWords();
  });

  it('shows the kept result link when the same upload link opens again after closing', async () => {
    const api = createFakeUploadApi({ ...linkInfo({ status: 'evaluating' }), students: [] });
    saveSecret(LINK_TOKEN, 11, 'secret-11');
    saveResultLink(LINK_TOKEN, 11, 'result-token-11', 'Pop Ion', 'K7M92P');
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Încărcarea s-a închis.');
    expect(screen.getByRole('link', { name: 'Vezi rezultatul' })).toHaveAttribute('href', `${window.location.origin}/u/rezultat/result-token-11`);
    const ticket = screen.getByRole('region', { name: 'Biletul pentru rezultat: Pop Ion' });
    expect(within(ticket).getByText('K7M-92P')).toBeInTheDocument();
    // Not right after sending: no word on when the result appears.
    expect(screen.queryByText(/^Rezultatul apare aici/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Alege-ți numele' })).not.toBeInTheDocument();
    expectNoGradingWords();
  });

  it('says where the result is when the results are published and this phone kept no link', async () => {
    const api = createFakeUploadApi({ ...linkInfo({ status: 'done', resultsOpen: true }), students: [] });
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByText('Rezultatele au fost publicate.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Linkul cu rezultatul tău este salvat pe telefonul și în browserul cu care ai trimis lucrarea. Dacă nu îl găsești acolo, cere profesorului linkul tău.',
      ),
    ).toBeInTheDocument();
    // Nothing went wrong: no error, and no word of the closed uploads.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Încărcarea s-a închis.')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Vezi rezultatul' })).not.toBeInTheDocument();
    expect(api.getLink).toHaveBeenCalledTimes(1);
    expectNoGradingWords();
  });

  it('shows the kept link with no error once the results are published', async () => {
    const api = createFakeUploadApi({ ...linkInfo({ status: 'done', resultsOpen: true }), students: [] });
    saveResultLink(LINK_TOKEN, 11, 'result-token-11', 'Pop Ion');
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByText('Rezultatele au fost publicate.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vezi rezultatul' })).toHaveAttribute('href', `${window.location.origin}/u/rezultat/result-token-11`);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/cere profesorului linkul tău/)).not.toBeInTheDocument();
    expectNoGradingWords();
  });

  it('finds a result link this phone kept through the other link of the test, and asks for that link only once', async () => {
    const other = 'multilinktoken22';
    const closed = { ...linkInfo({ status: 'done', resultsOpen: true }), students: [] };
    const api = createFakeUploadApi(closed);
    // The paper went through the link for many uploads, before the phone
    // remembered which test a link belongs to.
    saveResultLink(other, 11, 'result-token-11', 'Pop Ion');
    const first = render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByRole('link', { name: 'Vezi rezultatul' })).toHaveAttribute('href', `${window.location.origin}/u/rezultat/result-token-11`);
    // Kept before links had codes: the ticket has the QR code and no code row.
    const ticket = screen.getByRole('region', { name: 'Biletul pentru rezultat: Pop Ion' });
    expect(within(ticket).getByTitle('Codul QR al rezultatului')).toBeInTheDocument();
    expect(within(ticket).queryByText('Codul tău')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.getLink.mock.calls.map(([asked]) => asked)).toEqual([LINK_TOKEN, other]);
    expectNoGradingWords();

    first.unmount();
    api.getLink.mockClear();
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByRole('link', { name: 'Vezi rezultatul' })).toBeInTheDocument();
    expect(api.getLink.mock.calls.map(([asked]) => asked)).toEqual([LINK_TOKEN]);
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
    expect(await screen.findByText(/cere profesorului linkul tău/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Vezi rezultatul' })).not.toBeInTheDocument();
    expect(api.getLink).toHaveBeenCalledTimes(3);

    // Neither is asked for again.
    first.unmount();
    api.getLink.mockClear();
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByText(/cere profesorului linkul tău/)).toBeInTheDocument();
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
      `${window.location.origin}/u/rezultat/result-token-11`,
    );
    expect(screen.queryByRole('heading', { name: 'Alege-ți numele' })).not.toBeInTheDocument();
    expect(screen.getByText(/Ai trimis deja lucrarea de pe acest telefon/)).toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: 'Vezi rezultatul' })).toHaveAttribute(
      'href',
      `${window.location.origin}/u/rezultat/result-token-11`,
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
