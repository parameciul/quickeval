import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoGradingWords } from '../test/gradingWords.ts';
import { ResultTicket, TICKET_HOW } from './ResultTicket.tsx';
import { renderTicket, saveTicket, savesThroughShare } from './ticketImage.ts';

// `drop` makes the hidden QR canvas draw without giving its element back, as
// a library that did not pass its ref on would.
const qrRef = vi.hoisted(() => ({ drop: false }));
vi.mock('qrcode.react', async (original) => {
  const library = await original<typeof import('qrcode.react')>();
  const { forwardRef, createElement } = await import('react');
  return {
    ...library,
    QRCodeCanvas: forwardRef<HTMLCanvasElement, Parameters<typeof library.QRCodeCanvas>[0]>((props, ref) =>
      qrRef.drop ? createElement('canvas', { hidden: true }) : createElement(library.QRCodeCanvas, { ...props, ref }),
    ),
  };
});

vi.mock('./ticketImage.ts', async (original) => ({
  ...(await original<typeof import('./ticketImage.ts')>()),
  renderTicket: vi.fn(),
  saveTicket: vi.fn(),
  savesThroughShare: vi.fn(),
}));

const TEST = { title: 'Fracții', className: '6E2', code: '6E2-26T1' };
const png = new Blob(['png'], { type: 'image/png' });

function show(resultCode: string | null = 'K7M92P') {
  return render(<ResultTicket resultToken="result-token-11" resultCode={resultCode} studentName="Pop Ion" test={TEST} />);
}

// Shows the ticket and waits until its picture is made.
async function showReady(resultCode: string | null = 'K7M92P') {
  const shown = show(resultCode);
  await vi.waitFor(() => expect(renderTicket).toHaveBeenCalledTimes(1));
  // The picture's promise settles.
  await act(async () => {});
  return shown;
}

beforeEach(() => {
  vi.mocked(renderTicket).mockResolvedValue(png);
  vi.mocked(saveTicket).mockResolvedValue('downloaded');
  // An iPhone: the picture is made as the ticket shows.
  vi.mocked(savesThroughShare).mockReturnValue(true);
});

afterEach(() => {
  vi.mocked(renderTicket).mockReset();
  vi.mocked(saveTicket).mockReset();
  vi.mocked(savesThroughShare).mockReset();
  vi.useRealTimers();
  qrRef.drop = false;
});

describe('Salvează biletul', () => {
  it('is the main button of the ticket, before "Trimite-mi linkul"', () => {
    show();
    const names = screen.getAllByRole('button').map((button) => button.textContent);
    expect(names).toEqual(['Salvează biletul', 'Trimite-mi linkul', 'Arată linkul întreg']);
    expect(screen.getByRole('button', { name: 'Salvează biletul' })).toHaveClass('button', 'button-big');
  });

  it('makes the picture of the ticket as soon as it shows, with the QR code of the result link', async () => {
    await showReady();
    const drawn = vi.mocked(renderTicket).mock.calls[0]![0];
    expect(drawn).toMatchObject({
      testTitle: 'Fracții',
      studentName: 'Pop Ion',
      classLine: 'Clasa 6E2 · 6E2-26T1',
      code: 'K7M-92P',
      how: TICKET_HOW,
    });
    expect(drawn.qr).toBeInstanceOf(HTMLCanvasElement);
    // The hidden QR canvas goes once the picture is made.
    expect(document.querySelector('canvas')).toBeNull();
    expect(saveTicket).not.toHaveBeenCalled();
  });

  it('saves the picture inside the tap, with no wait, and says so', async () => {
    await showReady();
    // An iPhone opens the share sheet only inside the tap: the save starts
    // before the click returns.
    fireEvent.click(screen.getByRole('button', { name: 'Salvează biletul' }));
    expect(saveTicket).toHaveBeenCalledWith(png, 'bilet-6E2-26T1-Pop-Ion.png', 'Pop Ion · Fracții');
    expect(await screen.findByRole('status')).toHaveTextContent('Biletul a fost salvat. Îl găsești lângă pozele tale sau în descărcări.');
    // The picture is made once, not again for the tap.
    expect(renderTicket).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Salvează biletul' })).toBeEnabled();
    expectNoGradingWords();
  });

  it('waits for the picture when the tap comes before it is ready', async () => {
    let finish: (blob: Blob) => void = () => {};
    vi.mocked(renderTicket).mockImplementationOnce(() => new Promise<Blob>((resolve) => (finish = resolve)));
    show();
    await vi.waitFor(() => expect(renderTicket).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Salvează biletul' }));
    expect(screen.getByRole('button', { name: 'Salvează biletul' })).toBeDisabled();
    expect(saveTicket).not.toHaveBeenCalled();
    await act(async () => finish(png));
    expect(saveTicket).toHaveBeenCalledWith(png, 'bilet-6E2-26T1-Pop-Ion.png', 'Pop Ion · Fracții');
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(renderTicket).toHaveBeenCalledTimes(1);
  });

  it('saves a ticket without a code for a link that has none', async () => {
    await showReady(null);
    expect(vi.mocked(renderTicket).mock.calls[0]![0]).toMatchObject({ code: null, how: 'Scanează codul QR cu camera.' });
  });

  it('takes the note away after a few seconds', async () => {
    await showReady();
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Salvează biletul' }));
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says nothing when the student closes the share sheet', async () => {
    vi.mocked(saveTicket).mockResolvedValue('cancelled');
    await showReady();
    await userEvent.click(screen.getByRole('button', { name: 'Salvează biletul' }));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Salvează biletul' })).toBeEnabled());
    expect(saveTicket).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('makes the picture again on the tap when the first one failed', async () => {
    vi.mocked(renderTicket).mockRejectedValueOnce(new Error('no font'));
    show();
    await vi.waitFor(() => expect(renderTicket).toHaveBeenCalledTimes(1));
    await act(async () => {});
    // The QR canvas goes after a failure too; the tap draws it again.
    expect(document.querySelector('canvas')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Salvează biletul' }));
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(renderTicket).toHaveBeenCalledTimes(2);
    expect(saveTicket).toHaveBeenCalledWith(png, 'bilet-6E2-26T1-Pop-Ion.png', 'Pop Ion · Fracții');
  });

  it('tells the student to take a screenshot when the picture cannot be made, and can try again', async () => {
    vi.mocked(renderTicket).mockRejectedValue(new Error('no canvas'));
    show();
    await vi.waitFor(() => expect(renderTicket).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: 'Salvează biletul' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nu am putut salva biletul. Fă o poză ecranului.');
    expect(saveTicket).not.toHaveBeenCalled();
    vi.mocked(renderTicket).mockResolvedValue(png);
    await userEvent.click(screen.getByRole('button', { name: 'Salvează biletul' }));
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('makes the picture on the tap on a phone that downloads it', async () => {
    vi.mocked(savesThroughShare).mockReturnValue(false);
    show();
    await act(async () => {});
    expect(renderTicket).not.toHaveBeenCalled();
    expect(document.querySelector('canvas')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Salvează biletul' }));
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(renderTicket).toHaveBeenCalledTimes(1);
    expect(saveTicket).toHaveBeenCalledWith(png, 'bilet-6E2-26T1-Pop-Ion.png', 'Pop Ion · Fracții');
  });

  it('makes one picture at a time when many tickets show', async () => {
    let running = 0;
    let most = 0;
    const finish: (() => void)[] = [];
    vi.mocked(renderTicket).mockImplementation(
      () =>
        new Promise<Blob>((resolve) => {
          running += 1;
          most = Math.max(most, running);
          finish.push(() => {
            running -= 1;
            resolve(png);
          });
        }),
    );
    render(
      <>
        {[1, 2, 3, 4, 5].map((n) => (
          <ResultTicket key={n} resultToken={`result-token-${n}`} resultCode="K7M92P" studentName={`Elev ${n}`} test={TEST} />
        ))}
      </>,
    );
    for (let n = 1; n <= 5; n++) {
      await vi.waitFor(() => expect(renderTicket).toHaveBeenCalledTimes(n));
      // At most one hidden QR canvas on the page.
      expect(document.querySelectorAll('canvas').length).toBeLessThanOrEqual(1);
      await act(async () => finish[n - 1]!());
    }
    expect(most).toBe(1);
    expect(document.querySelector('canvas')).toBeNull();
  });

  it('waits in line for a tap on a ticket whose turn has not come yet', async () => {
    let running = 0;
    let most = 0;
    const finish: (() => void)[] = [];
    vi.mocked(renderTicket).mockImplementation(
      () =>
        new Promise<Blob>((resolve) => {
          running += 1;
          most = Math.max(most, running);
          finish.push(() => {
            running -= 1;
            resolve(png);
          });
        }),
    );
    render(
      <>
        {[1, 2].map((n) => (
          <ResultTicket key={n} resultToken={`result-token-${n}`} resultCode="K7M92P" studentName={`Elev ${n}`} test={TEST} />
        ))}
      </>,
    );
    await vi.waitFor(() => expect(renderTicket).toHaveBeenCalledTimes(1));
    // The second ticket's turn has not come: its tap waits for it.
    fireEvent.click(screen.getAllByRole('button', { name: 'Salvează biletul' })[1]!);
    await act(async () => {});
    expect(renderTicket).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('canvas').length).toBeLessThanOrEqual(1);
    await act(async () => finish[0]!());
    await vi.waitFor(() => expect(renderTicket).toHaveBeenCalledTimes(2));
    await act(async () => finish[1]!());
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(saveTicket).toHaveBeenCalledTimes(1);
    expect(saveTicket).toHaveBeenCalledWith(png, 'bilet-6E2-26T1-Elev-2.png', 'Elev 2 · Fracții');
    expect(most).toBe(1);
    expect(renderTicket).toHaveBeenCalledTimes(2);
  });

  it('gives the turn on when the QR code cannot be drawn, and tries again on the tap', async () => {
    qrRef.drop = true;
    render(
      <>
        {[1, 2].map((n) => (
          <ResultTicket key={n} resultToken={`result-token-${n}`} resultCode="K7M92P" studentName={`Elev ${n}`} test={TEST} />
        ))}
      </>,
    );
    // Both tickets had their turn: no hidden canvas is left waiting.
    for (let tick = 0; tick < 5; tick++) await act(async () => {});
    expect(document.querySelector('canvas')).toBeNull();
    expect(renderTicket).not.toHaveBeenCalled();
    qrRef.drop = false;
    await userEvent.click(screen.getAllByRole('button', { name: 'Salvează biletul' })[0]!);
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(renderTicket).toHaveBeenCalledTimes(1);
  });

  it('tells the student when the phone refuses to save it', async () => {
    vi.mocked(saveTicket).mockRejectedValue(new Error('refused'));
    await showReady();
    await userEvent.click(screen.getByRole('button', { name: 'Salvează biletul' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nu am putut salva biletul. Fă o poză ecranului.');
  });
});
