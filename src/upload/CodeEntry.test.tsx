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
      'Deschide testul pe telefonul cu care ai trimis lucrarea.',
      'Dacă nu găsești nimic, cere profesorului codul tău.',
    ]);
    // Nothing went wrong: no error, and no word of the closed uploads.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expectNoGradingWords();
  });

  it('opens the result with the right code, and keeps the link on this phone', async () => {
    const api = createFakeUploadApi(published());
    const goTo = vi.fn();
    render(<UploadApp api={api} token={LINK_TOKEN} goTo={goTo} />);
    await screen.findByText('Rezultatele au fost publicate.');
    await userEvent.type(field(), 'k7m92p');
    expect(field()).toHaveValue('K7M-92P');
    await userEvent.click(screen.getByRole('button', { name: 'Vezi rezultatul' }));
    await vi.waitFor(() => expect(goTo).toHaveBeenCalledWith('/u/rezultat/result-token-11'));
    expect(api.openByCode).toHaveBeenCalledWith(LINK_TOKEN, 'K7M-92P');
    expect(loadResultLink(LINK_TOKEN, 11)).toEqual({
      studentId: 11,
      studentName: 'Pop Ion',
      resultToken: 'result-token-11',
      resultCode: 'K7M92P',
      byCode: true,
    });
    // The page now shows the ticket, for the next visit.
    expect(await screen.findByRole('region', { name: 'Biletul pentru rezultat: Pop Ion' })).toBeInTheDocument();
  });

  it('sends the code with the Enter key too', async () => {
    const api = createFakeUploadApi(published());
    const goTo = vi.fn();
    render(<UploadApp api={api} token={LINK_TOKEN} goTo={goTo} />);
    await screen.findByText('Rezultatele au fost publicate.');
    await userEvent.type(field(), 'K7M92P{Enter}');
    await vi.waitFor(() => expect(goTo).toHaveBeenCalledTimes(1));
  });

  it('shows the ticket and opens no page while the results are not published', async () => {
    const api = createFakeUploadApi(closedOnly());
    const goTo = vi.fn();
    render(<UploadApp api={api} token={LINK_TOKEN} goTo={goTo} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Încărcarea s-a închis.');
    expect(screen.getByText('Dacă nu ai trimis lucrarea, spune-i profesorului.')).toBeInTheDocument();
    await userEvent.type(field(), 'K7M92P');
    await userEvent.click(screen.getByRole('button', { name: 'Vezi rezultatul' }));
    const ticket = await screen.findByRole('region', { name: 'Biletul pentru rezultat: Pop Ion' });
    expect(within(ticket).getByText('K7M-92P')).toBeInTheDocument();
    expect(goTo).not.toHaveBeenCalled();
    // The field gave way to the ticket.
    expect(screen.queryByLabelText('Scrie codul tău')).not.toBeInTheDocument();
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

  it('keeps the field behind "Am alt cod" when this phone has a ticket', async () => {
    const api = createFakeUploadApi(published());
    saveResultLink(LINK_TOKEN, 12, 'result-token-12', 'Stan Eva', 'ABC234');
    const goTo = vi.fn();
    render(<UploadApp api={api} token={LINK_TOKEN} goTo={goTo} />);
    expect(await screen.findByRole('region', { name: 'Biletul pentru rezultat: Stan Eva' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Scrie codul tău')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Am alt cod' }));
    await userEvent.type(field(), 'K7M92P');
    await userEvent.click(screen.getByRole('button', { name: 'Vezi rezultatul' }));
    await vi.waitFor(() => expect(goTo).toHaveBeenCalledWith('/u/rezultat/result-token-11'));
    // Both tickets are kept on this phone.
    expect(await screen.findByRole('region', { name: 'Biletul pentru rezultat: Pop Ion' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Biletul pentru rezultat: Stan Eva' })).toBeInTheDocument();
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
    expect(screen.queryByText(/Ai trimis deja lucrarea de pe acest telefon/)).not.toBeInTheDocument();
    // The ticket is still there, above the names.
    expect(screen.getByRole('region', { name: 'Biletul pentru rezultat: Pop Ion' })).toBeInTheDocument();
  });

  it('keeps a link this phone sent when the same code is typed on it', async () => {
    const api = createFakeUploadApi(published());
    saveResultLink(LINK_TOKEN, 11, 'result-token-11', 'Pop Ion', 'K7M92P');
    render(<UploadApp api={api} token={LINK_TOKEN} goTo={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Am alt cod' }));
    await userEvent.type(field(), 'K7M92P');
    await userEvent.click(screen.getByRole('button', { name: 'Vezi rezultatul' }));
    await vi.waitFor(() => expect(api.openByCode).toHaveBeenCalled());
    await screen.findByRole('button', { name: 'Am alt cod' });
    expect(loadResultLink(LINK_TOKEN, 11)).not.toHaveProperty('byCode');
  });

  it('teaches the code to a link this phone kept before links had codes', async () => {
    const api = createFakeUploadApi(closedOnly());
    saveResultLink(LINK_TOKEN, 11, 'result-token-11', 'Pop Ion', null);
    render(<UploadApp api={api} token={LINK_TOKEN} goTo={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Am alt cod' }));
    await userEvent.type(field(), 'K7M92P');
    await userEvent.click(screen.getByRole('button', { name: 'Vezi rezultatul' }));
    const ticket = await screen.findByRole('region', { name: 'Biletul pentru rezultat: Pop Ion' });
    expect(await within(ticket).findByText('K7M-92P')).toBeInTheDocument();
    expect(loadResultLink(LINK_TOKEN, 11)).toEqual({
      studentId: 11,
      studentName: 'Pop Ion',
      resultToken: 'result-token-11',
      resultCode: 'K7M92P',
    });
  });

  it('shows no code field while the uploads are open or the test has not started', async () => {
    const open = render(<UploadApp api={createFakeUploadApi()} token={LINK_TOKEN} goTo={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Pop Ion' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Scrie codul tău')).not.toBeInTheDocument();
    open.unmount();
    render(<UploadApp api={createFakeUploadApi({ ...linkInfo({ status: 'draft' }), students: [] })} token={LINK_TOKEN} goTo={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Testul nu a început încă.');
    expect(screen.queryByLabelText('Scrie codul tău')).not.toBeInTheDocument();
  });
});
