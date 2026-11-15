import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import headers from '../../../public/_headers?raw';
import { PRINT_LOAD_TIMEOUT, printPdf, printsInFrame } from './printPdf.ts';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const EDGE = `${CHROME} Edg/131.0.0.0`;
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';
const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1';
const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const URL = '/api/admin/tests/6E2-26T1/print';

describe('printsInFrame', () => {
  it('prints in a frame in Chrome, Edge and Firefox, also on a Mac', () => {
    expect(printsInFrame(CHROME, 0)).toBe(true);
    expect(printsInFrame(EDGE, 10)).toBe(true);
    expect(printsInFrame(FIREFOX, 0)).toBe(true);
    expect(printsInFrame(MAC_CHROME, 0)).toBe(true);
  });

  it('opens a tab on an iPhone, an iPad and in Safari', () => {
    expect(printsInFrame(IPHONE, 5)).toBe(false);
    expect(printsInFrame(SAFARI, 0)).toBe(false);
    // An iPad asks for the desktop site with a Mac's name, and has a touch screen.
    expect(printsInFrame(SAFARI.replace('Version/18.1 Safari', 'Version/18.1 Mobile Safari'), 5)).toBe(false);
    expect(printsInFrame(MAC_CHROME, 5)).toBe(false);
  });
});

describe('printPdf', () => {
  let open: ReturnType<typeof vi.fn>;

  it("is allowed by the site's security policy: a page may frame the site's own files", () => {
    const policy = headers.split('\n').find((line) => line.trim().startsWith('Content-Security-Policy:'))!;
    expect(policy).toMatch(/frame-src 'self'[ ;]/);
  });

  beforeEach(() => {
    open = vi.fn();
    vi.stubGlobal('open', open);
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(CHROME);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  // The frame the last print made, with the page it loaded and its print().
  function loadFrame(page: { contentType?: string; throws?: boolean; printThrows?: boolean }) {
    const frame = document.querySelector<HTMLIFrameElement>('iframe.print-frame')!;
    const print = vi.fn(() => {
      if (page.printThrows) throw new Error('blocked');
    });
    Object.defineProperty(frame, 'contentDocument', {
      configurable: true,
      get: () => {
        if (page.throws) throw new DOMException('cross-origin', 'SecurityError');
        return page.contentType === undefined ? null : { contentType: page.contentType };
      },
    });
    Object.defineProperty(frame, 'contentWindow', { configurable: true, value: { focus: vi.fn(), print } });
    frame.dispatchEvent(new Event('load'));
    return { frame, print };
  }

  it('loads the PDF in a hidden frame and opens the print window on it', async () => {
    const done = printPdf(URL);
    const frame = document.querySelector<HTMLIFrameElement>('iframe.print-frame')!;
    expect(frame.getAttribute('src')).toBe(URL);
    expect(frame).toHaveAttribute('aria-hidden', 'true');
    const { print } = loadFrame({ contentType: 'application/pdf' });
    await expect(done).resolves.toBe('printed');
    expect(print).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
    // The frame stays: removing it now could close the print window.
    expect(frame.isConnected).toBe(true);
  });

  it('prints nothing when the answer is not a PDF', async () => {
    const done = printPdf(URL);
    const { frame, print } = loadFrame({ contentType: 'application/json' });
    await expect(done).resolves.toBe('failed');
    expect(print).not.toHaveBeenCalled();
    expect(frame.isConnected).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('opens the PDF in a tab when the page cannot reach the frame', async () => {
    const done = printPdf(URL);
    const { frame } = loadFrame({ throws: true });
    await expect(done).resolves.toBe('tab');
    expect(open).toHaveBeenCalledWith(URL, '_blank', 'noopener');
    expect(frame.isConnected).toBe(false);
  });

  it('opens the PDF in a tab when the frame has no page', async () => {
    const done = printPdf(URL);
    loadFrame({});
    await expect(done).resolves.toBe('tab');
    expect(open).toHaveBeenCalledWith(URL, '_blank', 'noopener');
  });

  it('opens the PDF in a tab when the browser refuses to print the frame', async () => {
    const done = printPdf(URL);
    loadFrame({ contentType: 'application/pdf', printThrows: true });
    await expect(done).resolves.toBe('tab');
    expect(open).toHaveBeenCalledWith(URL, '_blank', 'noopener');
  });

  it('opens the PDF in a tab when the frame does not load in time', async () => {
    vi.useFakeTimers();
    const done = printPdf(URL);
    vi.advanceTimersByTime(PRINT_LOAD_TIMEOUT);
    await expect(done).resolves.toBe('tab');
    expect(open).toHaveBeenCalledWith(URL, '_blank', 'noopener');
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('opens the PDF in a tab at once in Safari, with no frame', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(SAFARI);
    await expect(printPdf(URL)).resolves.toBe('tab');
    expect(open).toHaveBeenCalledWith(URL, '_blank', 'noopener');
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('keeps one frame: a new print takes the place of the last one', async () => {
    const first = printPdf(URL);
    loadFrame({ contentType: 'application/pdf' });
    await first;
    const second = printPdf('/api/admin/tests/6E2-26T1/ces/print');
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
    expect(document.querySelector('iframe')!.getAttribute('src')).toBe('/api/admin/tests/6E2-26T1/ces/print');
    loadFrame({ contentType: 'application/pdf' });
    await expect(second).resolves.toBe('printed');
  });
});
