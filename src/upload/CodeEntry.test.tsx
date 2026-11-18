import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../ui/ApiError.ts';
import { createFakeUploadApi, LINK_TOKEN, linkInfo } from '../test/fakeUploadApi.ts';
import { expectNoGradingWords } from '../test/gradingWords.ts';
import { typedCode } from './CodeEntry.tsx';
import { loadResultLink, saveResultLink } from './resultLinks.ts';
import { UploadApp } from './UploadApp.tsx';

const published = () => ({ ...linkInfo({ status: 'done', resultsOpen: true }), students: [] });
const closedOnly = () => ({ ...linkInfo({ status: 'evaluating' }), students: [] });
const field = () => screen.getByLabelText('Scrie codul tău');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('typedCode', () => {
  it('shows capitals with a dash after the third character', () => {
    expect(typedCode('k')).toBe('K');
    expect(typedCode('k7m')).toBe('K7M');
    expect(typedCode('k7m9')).toBe('K7M-9');
    expect(typedCode('k7m92p')).toBe('K7M-92P');
    expect(typedCode('K7M-92P')).toBe('K7M-92P');
  });

  it('drops spaces and signs, and what is past six characters', () => {
    expect(typedCode(' k7m - 92p ')).toBe('K7M-92P');
    expect(typedCode('k7m92pxyz')).toBe('K7M-92P');
    expect(typedCode('k7m.')).toBe('K7M');
  });

  it('lets the student delete the dash', () => {
    expect(typedCode('K7M-')).toBe('K7M');
  });

  it('keeps a character the codes do not use, so the student sees it', () => {
    expect(typedCode('o0il1')).toBe('O0I-L1');
  });
});

describe('the code field on the closed test page', () => {
  it('shows the field and where to look, when the results are published and this phone kept no link', async () => {
    const api = createFakeUploadApi(published());
    render(<UploadApp api={api} token={LINK_TOKEN} goTo={vi.fn()} />);
    expect(await screen.findByText('Rezultatele au fost publicate.')).toBeInTheDocument();
    const entry = screen.getByRole('region', { name: 'Deschide rezultatul cu codul' });
    expect(within(entry).getByLabelText('Scrie codul tău')).toHaveValue('');
    expect(within(entry).getByRole('button', { name: 'Vezi rezultatul' })).toBeEnabled();
    expect(within(entry).getByText('Nu știi codul?')).toBeInTheDocument();
    expect(within(entry).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Caută în poze biletul cu codul QR.',
      'Caută în mesaje linkul pe care ți l-ai trimis.',
      'Deschide linkul testului pe telefonul cu care ai trimis lucrarea.',
      'Dacă nu găsești nimic, cere profesorului codul tău.',
    ]);
    // Nothing went wrong: no error, and no word of the closed uploads.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expectNoGradingWords();
  });

  it('opens the result with the right code, and keeps no link on this phone', async () => {
    const api = createFakeUploadApi(published());
    const goTo = vi.fn();
    const openResult = vi.fn();
    const first = render(<UploadApp api={api} token={LINK_TOKEN} goTo={goTo} openResult={openResult} />);
    await screen.findByText('Rezultatele au fost publicate.');
    await userEvent.type(field(), 'k7m92p');
    expect(field()).toHaveValue('K7M-92P');
    await userEvent.click(screen.getByRole('button', { name: 'Vezi rezultatul' }));
    await vi.waitFor(() => expect(goTo).toHaveBeenCalledWith('/u/result/result-token-11'));
    expect(api.openByCode).toHaveBeenCalledWith(LINK_TOKEN, 'K7M-92P');
    // A code typed on a borrowed phone must not open by itself for the
    // phone's owner later: the phone keeps only the links it sent.
    expect(loadResultLink(LINK_TOKEN, 11)).toBeNull();
    expect(screen.queryByRole('region', { name: /^Biletul pentru rezultat/ })).not.toBeInTheDocument();

    // Back, or the next visit: the field again, and nothing opens by itself.
    first.unmount();
    render(<UploadApp api={api} token={LINK_TOKEN} goTo={vi.fn()} openResult={openResult} />);
    expect(await screen.findByLabelText('Scrie codul tău')).toBeInTheDocument();
    expect(openResult).not.toHaveBeenCalled();
  });

  it('ignores a link an older page kept for a typed code: it neither opens by itself nor shows as a ticket', async () => {
    // What the page wrote before it stopped keeping such links.
    const oldEntry = JSON.stringify({ resultToken: 'result-token-11', studentName: 'Pop Ion', resultCode: 'K7M92P', byCode: true });
    localStorage.setItem(`qe.result.${LINK_TOKEN}.11`, oldEntry);
    const openResult = vi.fn();
    const after = render(<UploadApp api={createFakeUploadApi(published())} token={LINK_TOKEN} goTo={vi.fn()} openResult={openResult} />);
    expect(await screen.findByLabelText('Scrie codul tău')).toBeInTheDocument();
    expect(openResult).not.toHaveBeenCalled();
    after.unmount();
    render(<UploadApp api={createFakeUploadApi(closedOnly())} token={LINK_TOKEN} goTo={vi.fn()} openResult={openResult} />);
    expect(await screen.findByRole('status')).toHaveTextContent('Încărcarea s-a închis.');
    expect(screen.queryByRole('region', { name: /^Biletul pentru rezultat/ })).not.toBeInTheDocument();
  });

  it('sends the code with the Enter key too', async () => {
    const api = createFakeUploadApi(published());
    const goTo = vi.fn();
    render(<UploadApp api={api} token={LINK_TOKEN} goTo={goTo} />);
    await screen.findByText('Rezultatele au fost publicate.');
    await userEvent.type(field(), 'K7M92P{Enter}');
    await vi.waitFor(() => expect(goTo).toHaveBeenCalledTimes(1));
  });

  // Before the publish a code would open nothing yet.
  it('shows no field while the results are not published, with or without tickets', async () => {
    const empty = render(<UploadApp api={createFakeUploadApi(closedOnly())} token={LINK_TOKEN} goTo={vi.fn()} />);
    expect(await screen.findByRole('status')).toHaveTextContent(/^Încărcarea s-a închis\.\s*Dacă nu ai trimis lucrarea, spune-i profesorului\.$/);
    expect(screen.queryByLabelText('Scrie codul tău')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vezi rezultatul' })).not.toBeInTheDocument();
    expectNoGradingWords();
    empty.unmount();

    saveResultLink(LINK_TOKEN, 12, 'result-token-12', 'Stan Eva', 'ABC234');
    saveResultLink(LINK_TOKEN, 10, 'result-token-10', 'Ionescu Ana', 'DEF567');
    render(<UploadApp api={createFakeUploadApi(closedOnly())} token={LINK_TOKEN} goTo={vi.fn()} />);
    expect(await screen.findByRole('region', { name: 'Biletul pentru rezultat: Stan Eva' })).toBeInTheDocument();
    // Two papers from one phone: the green box says both went.
    expect(screen.getByRole('status')).toHaveTextContent('Lucrările au fost trimise de pe acest telefon.');
    expect(screen.getByRole('region', { name: 'Biletul pentru rezultat: Ionescu Ana' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Scrie codul tău')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Am alt cod' })).not.toBeInTheDocument();
  });

  it('shows the refusal under the field and keeps what was typed', async () => {
    const api = createFakeUploadApi(published());
    const goTo = vi.fn();
    render(<UploadApp api={api} token={LINK_TOKEN} goTo={goTo} />);
    await screen.findByText('Rezultatele au fost publicate.');
    await userEvent.type(field(), 'K7M92B');
    await userEvent.click(screen.getByRole('button', { name: 'Vezi rezultatul' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Codul nu este bun. Verifică fiecare literă și încearcă din nou.');
    expect(field()).toHaveValue('K7M-92B');
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(field()).toHaveAccessibleDescription('Codul nu este bun. Verifică fiecare literă și încearcă din nou.');
    expect(goTo).not.toHaveBeenCalled();
    expect(localStorage.getItem(`qe.result.${LINK_TOKEN}.11`)).toBeNull();
    // Typing again takes the refusal away.
    await userEvent.type(field(), '{Backspace}');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expectNoGradingWords();
  });

  it('says so when too many wrong codes were typed', async () => {
    const api = createFakeUploadApi(published());
    api.openByCode.mockRejectedValueOnce(new ApiError(429, 'too_many_tries', 'Prea multe încercări. Încearcă din nou peste câteva minute.'));
    render(<UploadApp api={api} token={LINK_TOKEN} goTo={vi.fn()} />);
    await screen.findByText('Rezultatele au fost publicate.');
    await userEvent.type(field(), 'K7M92P');
    await userEvent.click(screen.getByRole('button', { name: 'Vezi rezultatul' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Prea multe încercări. Încearcă din nou peste câteva minute.');
  });

  it('asks for a code before it asks the server', async () => {
    const api = createFakeUploadApi(published());
    render(<UploadApp api={api} token={LINK_TOKEN} goTo={vi.fn()} />);
    await screen.findByText('Rezultatele au fost publicate.');
    await userEvent.click(screen.getByRole('button', { name: 'Vezi rezultatul' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Scrie codul de pe biletul tău.');
    expect(api.openByCode).not.toHaveBeenCalled();
  });

  // Every text sent costs one of the test's shared tries: a text that can
  // never be a code (too short, or with a character the codes do not use)
  // stays on the phone.
  it('does not send a text that can never be a code, so it costs no try', async () => {
    const api = createFakeUploadApi(published());
    render(<UploadApp api={api} token={LINK_TOKEN} goTo={vi.fn()} />);
    await screen.findByText('Rezultatele au fost publicate.');
    const button = () => screen.getByRole('button', { name: 'Vezi rezultatul' });
    const message = 'Codul are 6 caractere, fără 0, O, 1, I sau L. Verifică biletul.';
    for (const typed of ['K7M92', 'K7MO2P', 'K7M12P']) {
      await userEvent.clear(field());
      await userEvent.type(field(), typed);
      await userEvent.click(button());
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(field()).toHaveAttribute('aria-invalid', 'true');
    }
    expect(api.openByCode).not.toHaveBeenCalled();
    expectNoGradingWords();
  });

  it('opens the result of the code typed on a phone that kept the links of several papers', async () => {
    const api = createFakeUploadApi(published());
    // Two links: with one, the published result would open by itself.
    saveResultLink(LINK_TOKEN, 12, 'result-token-12', 'Stan Eva', 'ABC234');
    saveResultLink(LINK_TOKEN, 10, 'result-token-10', 'Ionescu Ana', 'DEF567');
    const goTo = vi.fn();
    const openResult = vi.fn();
    render(<UploadApp api={api} token={LINK_TOKEN} goTo={goTo} openResult={openResult} />);
    await screen.findByText('Rezultatele au fost publicate.');
    // The field at once, and no ticket.
    expect(screen.queryByRole('region', { name: /^Biletul pentru rezultat/ })).not.toBeInTheDocument();
    await userEvent.type(field(), 'K7M92P');
    await userEvent.click(screen.getByRole('button', { name: 'Vezi rezultatul' }));
    await vi.waitFor(() => expect(goTo).toHaveBeenCalledWith('/u/result/result-token-11'));
    expect(openResult).not.toHaveBeenCalled();
    // No new link is kept, the others stay, and no ticket shows.
    expect(loadResultLink(LINK_TOKEN, 11)).toBeNull();
    expect(loadResultLink(LINK_TOKEN, 12)).toMatchObject({ resultToken: 'result-token-12' });
    expect(screen.queryByRole('region', { name: /^Biletul pentru rezultat/ })).not.toBeInTheDocument();
  });

  it('does not lock the default link of a phone that only opened a result with its code', async () => {
    const api = createFakeUploadApi(published());
    const goTo = vi.fn();
    const first = render(<UploadApp api={api} token={LINK_TOKEN} goTo={goTo} />);
    await screen.findByText('Rezultatele au fost publicate.');
    await userEvent.type(field(), 'K7M92P');
    await userEvent.click(screen.getByRole('button', { name: 'Vezi rezultatul' }));
    await vi.waitFor(() => expect(goTo).toHaveBeenCalled());
    first.unmount();
    // The teacher opens the uploads again: this phone may still send a paper.
    const reopened = linkInfo();
    reopened.students[1]!.state = 'done';
    render(<UploadApp api={createFakeUploadApi(reopened)} token={LINK_TOKEN} goTo={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Ionescu Ana' })).toBeEnabled();
    expect(screen.queryByText(/Cu acest link nu mai poți trimite/)).not.toBeInTheDocument();
    // The code kept nothing, so there is no ticket above the names.
    expect(screen.queryByRole('region', { name: /^Biletul pentru rezultat/ })).not.toBeInTheDocument();
  });

  // With several links kept, the published page asks for a code: the
  // student may type the code of a link this phone already keeps.
  it('keeps a link this phone sent when the same code is typed on it', async () => {
    const api = createFakeUploadApi(published());
    saveResultLink(LINK_TOKEN, 11, 'result-token-11', 'Pop Ion', 'K7M92P');
    saveResultLink(LINK_TOKEN, 12, 'result-token-12', 'Stan Eva', 'ABC234');
    const goTo = vi.fn();
    render(<UploadApp api={api} token={LINK_TOKEN} goTo={goTo} openResult={vi.fn()} />);
    await screen.findByText('Rezultatele au fost publicate.');
    await userEvent.type(field(), 'K7M92P');
    await userEvent.click(screen.getByRole('button', { name: 'Vezi rezultatul' }));
    await vi.waitFor(() => expect(goTo).toHaveBeenCalledWith('/u/result/result-token-11'));
    expect(loadResultLink(LINK_TOKEN, 11)).toEqual({ studentId: 11, studentName: 'Pop Ion', resultToken: 'result-token-11', resultCode: 'K7M92P' });
  });

  it('teaches the code to a link this phone kept before links had codes', async () => {
    const api = createFakeUploadApi(published());
    saveResultLink(LINK_TOKEN, 11, 'result-token-11', 'Pop Ion', null);
    saveResultLink(LINK_TOKEN, 12, 'result-token-12', 'Stan Eva', 'ABC234');
    const goTo = vi.fn();
    render(<UploadApp api={api} token={LINK_TOKEN} goTo={goTo} openResult={vi.fn()} />);
    await screen.findByText('Rezultatele au fost publicate.');
    await userEvent.type(field(), 'K7M92P');
    await userEvent.click(screen.getByRole('button', { name: 'Vezi rezultatul' }));
    await vi.waitFor(() => expect(goTo).toHaveBeenCalledWith('/u/result/result-token-11'));
    expect(loadResultLink(LINK_TOKEN, 11)).toEqual({
      studentId: 11,
      studentName: 'Pop Ion',
      resultToken: 'result-token-11',
      resultCode: 'K7M92P',
    });
  });

  it('shows no code field while the uploads are open or the test has not started either', async () => {
    const open = render(<UploadApp api={createFakeUploadApi()} token={LINK_TOKEN} goTo={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Pop Ion' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Scrie codul tău')).not.toBeInTheDocument();
    open.unmount();
    render(<UploadApp api={createFakeUploadApi({ ...linkInfo({ status: 'draft' }), students: [] })} token={LINK_TOKEN} goTo={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Testul nu a început încă.');
    expect(screen.queryByLabelText('Scrie codul tău')).not.toBeInTheDocument();
  });
});
