import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoGradingWords } from '../test/gradingWords.ts';
import { ResultTicket, TICKET_HOW, TICKET_HOW_NO_CODE } from './ResultTicket.tsx';

const TEST = { title: 'Fracții', className: '6E2', code: '6E2-26T1' };
const URL_TEXT = `${window.location.origin}/u/result/result-token-11`;

// Sets what the browser offers: the share sheet, the clipboard, or neither.
function browserOffers({ share, writeText }: { share?: (data: ShareData) => Promise<void>; writeText?: (text: string) => Promise<void> }) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true });
  Object.defineProperty(navigator, 'clipboard', { value: writeText ? { writeText } : undefined, configurable: true, writable: true });
}

function show(props: Partial<Parameters<typeof ResultTicket>[0]> = {}) {
  return render(<ResultTicket resultToken="result-token-11" resultCode="K7M92P" studentName="Pop Ion" test={TEST} {...props} />);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  browserOffers({});
});

describe('ResultTicket', () => {
  it('shows the test, the student, the QR code of the result link and the code', () => {
    show();
    const ticket = screen.getByRole('region', { name: 'Biletul pentru rezultat: Pop Ion' });
    expect(within(ticket).getByText('Biletul tău pentru rezultat')).toBeInTheDocument();
    expect(within(ticket).getByText('Fracții')).toBeInTheDocument();
    expect(within(ticket).getByText('Pop Ion')).toBeInTheDocument();
    expect(within(ticket).getByText('Clasa 6E2 · 6E2-26T1')).toBeInTheDocument();
    expect(within(ticket).getByTitle('Codul QR al rezultatului')).toBeInTheDocument();
    expect(within(ticket).getByText('Codul tău')).toBeInTheDocument();
    expect(within(ticket).getByText('K7M-92P')).toBeInTheDocument();
    expect(within(ticket).getByRole('link', { name: 'Vezi rezultatul' })).toHaveAttribute('href', URL_TEXT);
    expectNoGradingWords();
  });

  // The steps are for later: they are on the saved picture (SaveTicket's
  // tests), never on the page, where they read like something to do now.
  it('shows no steps to see the result on the page', () => {
    for (const resultCode of ['K7M92P', null]) {
      const shown = show({ resultCode });
      const ticket = screen.getByRole('region', { name: 'Biletul pentru rezultat: Pop Ion' });
      expect(within(ticket).queryByText(/^Ca să vezi rezultatul/)).not.toBeInTheDocument();
      expect(within(ticket).queryByText(TICKET_HOW.lead)).not.toBeInTheDocument();
      for (const step of TICKET_HOW.steps) expect(within(ticket).queryByText(step)).not.toBeInTheDocument();
      expect(within(ticket).queryByRole('list')).not.toBeInTheDocument();
      shown.unmount();
    }
  });

  it('writes, for the picture, what it is for, then the two options, with no camera', () => {
    expect(TICKET_HOW.lead).toBe('Cu acest bilet îți vezi rezultatul la acest test.');
    expect(TICKET_HOW.note).toBe('Rezultatul apare doar după ce profesorul corectează și publică lucrările.');
    expect(TICKET_HOW.intro).toBe('Ca să vezi rezultatul, alege una dintre variante:');
    expect(TICKET_HOW.steps).toEqual([
      'Pe telefon, ține apăsat pe codul QR și deschide linkul.',
      'Deschide linkul de trimitere a lucrării (codul QR de pe test) și introdu codul tău.',
    ]);
    expect(TICKET_HOW_NO_CODE).toEqual({
      lead: TICKET_HOW.lead,
      note: TICKET_HOW.note,
      intro: 'Ca să vezi rezultatul, pe telefon ține apăsat pe codul QR și deschide linkul.',
      steps: [],
    });
    // Scanning is for another phone, where someone else would see the result.
    const words = [TICKET_HOW.lead, TICKET_HOW.note, TICKET_HOW.intro, ...TICKET_HOW.steps, TICKET_HOW_NO_CODE.intro].join(' ');
    expect(words.toLowerCase()).not.toMatch(/camer|scane/);
    expectNoGradingWords(words);
  });

  it('opens the result on a tap or a long press of the QR code', () => {
    show();
    const qr = screen.getByTitle('Codul QR al rezultatului').closest('a')!;
    expect(qr).toHaveAttribute('href', URL_TEXT);
    expect(qr).toHaveClass('ticket-qr');
  });

  it('draws the QR code dark on white, whatever the theme', () => {
    show();
    const paths = screen.getByTitle('Codul QR al rezultatului').closest('svg')!.querySelectorAll('path');
    expect([...paths].map((path) => path.getAttribute('fill'))).toEqual(['#FFFFFF', '#000000']);
  });

  it('shows no code row for a link kept before links had codes', () => {
    show({ resultCode: null });
    expect(screen.queryByText('Codul tău')).not.toBeInTheDocument();
    expect(screen.getByTitle('Codul QR al rezultatului')).toBeInTheDocument();
  });

  it('writes no long text under its buttons', () => {
    show();
    expect(screen.queryByText(/^Rezultatul apare/)).not.toBeInTheDocument();
  });

  it('keeps the long address behind a button, whole and with a copy button', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    browserOffers({ writeText });
    show();
    expect(screen.queryByText(URL_TEXT)).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Arată linkul întreg' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(screen.getByText(URL_TEXT)).toHaveClass('result-link-url');
    // Text, not a field that cuts the address off.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Copiază linkul' }));
    expect(writeText).toHaveBeenCalledWith(URL_TEXT);
    expect(screen.getByRole('button', { name: 'Copiat!' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ascunde linkul' }));
    expect(screen.queryByText(URL_TEXT)).not.toBeInTheDocument();
  });

  it('sends the link with the code through the share sheet', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    browserOffers({ share });
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Trimite-mi linkul' }));
    expect(share).toHaveBeenCalledWith({ url: URL_TEXT, title: 'Pop Ion · Fracții', text: 'Codul meu: K7M-92P' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('sends the link alone when it has no code', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    browserOffers({ share });
    show({ resultCode: null });
    await userEvent.click(screen.getByRole('button', { name: 'Trimite-mi linkul' }));
    expect(share).toHaveBeenCalledWith({ url: URL_TEXT, title: 'Pop Ion · Fracții' });
  });

  it('does nothing more when the share sheet is closed', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    browserOffers({ share: vi.fn().mockRejectedValue(new DOMException('closed', 'AbortError')), writeText });
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Trimite-mi linkul' }));
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('copies the link when the phone has no share sheet, and says so for a while', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    browserOffers({ writeText });
    vi.useFakeTimers();
    show();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Trimite-mi linkul' }));
    });
    expect(writeText).toHaveBeenCalledWith(URL_TEXT);
    expect(screen.getByRole('status')).toHaveTextContent('Linkul a fost copiat.');
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the whole link to copy by hand when it can neither share nor copy', async () => {
    browserOffers({});
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Trimite-mi linkul' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Copiază linkul de aici:');
    expect(screen.getByText(URL_TEXT)).toHaveClass('result-link-url');
  });
});
