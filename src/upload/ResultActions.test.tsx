import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudentResultView } from '../../shared/api.ts';
import { renderPdf } from '../admin/pdf/renderPdf.ts';
import { saveFile } from '../admin/pdf/share.ts';
import { expectNoGradingWords } from '../test/gradingWords.ts';
import { ResultActions } from './ResultActions.tsx';

vi.mock('../admin/pdf/renderPdf.ts', () => ({ renderPdf: vi.fn() }));
vi.mock('../admin/pdf/share.ts', () => ({ saveFile: vi.fn() }));

const URL_TEXT = 'https://mqgrader.ro/u/rezultat/abc';

const graded: StudentResultView = {
  testCode: '6E2-26T1',
  testTitle: 'Fracții',
  className: '6E2',
  studentName: 'Pop Ion',
  submittedAt: '2026-11-03T08:15:00.000Z',
  status: 'graded',
  files: [],
  evaluation: {
    maxTotal: 10,
    officePoints: 1,
    total: 6.5,
    grade: 6.5,
    summary: 'Ai lucrat bine la fracții.',
    strengths: [],
    recommendations: [],
    items: [{ exerciseId: 'I.1', label: 'Subiectul I, ex. 1', maxPoints: 4.5, points: 4.5, studentAnswer: '3/4', comment: 'Corect.' }],
  },
};

// Sets what the browser offers: the share sheet, the clipboard, or neither.
function browserOffers({ share, writeText }: { share?: (data: ShareData) => Promise<void>; writeText?: (text: string) => Promise<void> }) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true });
  Object.defineProperty(navigator, 'clipboard', { value: writeText ? { writeText } : undefined, configurable: true, writable: true });
}

beforeEach(() => {
  browserOffers({});
});

afterEach(() => {
  vi.mocked(renderPdf).mockReset();
  vi.mocked(saveFile).mockReset();
  browserOffers({});
});

describe('ResultActions', () => {
  it('shares the link through the share sheet', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    browserOffers({ share });
    render(<ResultActions result={graded} url={URL_TEXT} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Trimite linkul' }));
    });
    expect(share).toHaveBeenCalledWith({ url: URL_TEXT, title: 'Pop Ion · Fracții' });
    expect(screen.queryByText('Linkul a fost copiat.')).toBeNull();
  });

  it('does nothing more when the share sheet is closed', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    browserOffers({ share: vi.fn().mockRejectedValue(new DOMException('closed', 'AbortError')), writeText });
    render(<ResultActions result={graded} url={URL_TEXT} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Trimite linkul' }));
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(URL_TEXT)).toBeNull();
  });

  it('copies the link when sharing is not possible', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    browserOffers({ writeText });
    render(<ResultActions result={graded} url={URL_TEXT} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Trimite linkul' }));
    });
    expect(writeText).toHaveBeenCalledWith(URL_TEXT);
    expect(screen.getByRole('status')).toHaveTextContent('Linkul a fost copiat.');
  });

  it('copies the link when the share sheet fails for another reason', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    browserOffers({ share: vi.fn().mockRejectedValue(new DOMException('no', 'NotAllowedError')), writeText });
    render(<ResultActions result={graded} url={URL_TEXT} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Trimite linkul' }));
    });
    expect(writeText).toHaveBeenCalledWith(URL_TEXT);
    expect(screen.getByRole('status')).toHaveTextContent('Linkul a fost copiat.');
  });

  it('shows the link to copy by hand when copying fails too', async () => {
    browserOffers({ writeText: vi.fn().mockRejectedValue(new Error('blocked')) });
    render(<ResultActions result={graded} url={URL_TEXT} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Trimite linkul' }));
    });
    expect(screen.getByText('Copiază linkul de aici:')).toBeInTheDocument();
    expect(screen.getByText(URL_TEXT)).toHaveClass('result-link-url');
  });

  it('shows the link to copy by hand when the browser has no clipboard', async () => {
    render(<ResultActions result={graded} url={URL_TEXT} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Trimite linkul' }));
    });
    expect(screen.getByText(URL_TEXT)).toBeInTheDocument();
  });

  it('downloads the student PDF once, with the button disabled meanwhile', async () => {
    const blob = new Blob(['%PDF'], { type: 'application/pdf' });
    let finish: (value: Blob) => void = () => {};
    vi.mocked(renderPdf).mockReturnValue(new Promise<Blob>((resolve) => (finish = resolve)));
    render(<ResultActions result={graded} url={URL_TEXT} />);
    const button = screen.getByRole('button', { name: 'Descarcă PDF' });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    fireEvent.click(button);
    await act(async () => {
      finish(blob);
    });
    expect(renderPdf).toHaveBeenCalledTimes(1);
    expect(saveFile).toHaveBeenCalledWith(blob, '6E2-26T1-Pop-Ion.pdf');
    expect(button).toBeEnabled();
  });

  it('says so when the PDF cannot be made', async () => {
    vi.mocked(renderPdf).mockRejectedValue(new Error('no font'));
    render(<ResultActions result={graded} url={URL_TEXT} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Descarcă PDF' }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Nu am putut face PDF-ul. Încearcă din nou.');
    expect(saveFile).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Descarcă PDF' })).toBeEnabled();
  });

  it('has no PDF button before the result is graded', () => {
    render(<ResultActions result={{ ...graded, status: 'submitted', evaluation: null }} url={URL_TEXT} />);
    expect(screen.getByRole('button', { name: 'Trimite linkul' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descarcă PDF' })).toBeNull();
    expectNoGradingWords();
  });
});
