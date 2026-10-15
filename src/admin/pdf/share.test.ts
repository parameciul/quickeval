import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveFile, shareFile } from './share.ts';

const blob = () => new Blob(['%PDF-1.7 test'], { type: 'application/pdf' });

let clicked: { download: string; href: string }[];

beforeEach(() => {
  clicked = [];
  URL.createObjectURL = vi.fn(() => 'blob:test-1');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ download: this.download, href: this.href });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
});

function setShare(share: ((data: ShareData) => Promise<void>) | undefined, canShare: boolean | undefined = true) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  Object.defineProperty(navigator, 'canShare', { value: canShare === undefined ? undefined : () => canShare, configurable: true });
}

describe('saveFile', () => {
  it('saves the file through a link with its name, and frees the address later', () => {
    vi.useFakeTimers();
    saveFile(blob(), '6E2-26T1-raport.pdf');
    expect(clicked).toEqual([{ download: '6E2-26T1-raport.pdf', href: 'blob:test-1' }]);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-1');
  });
});

describe('shareFile', () => {
  it('shares the PDF file through the share sheet', async () => {
    const share = vi.fn(async (_data: ShareData) => undefined);
    setShare(share);
    expect(await shareFile(blob(), 'raport.pdf', 'Raportul clasei')).toBe('shared');
    const data = share.mock.calls[0]![0];
    expect(data.title).toBe('Raportul clasei');
    expect(data.files).toHaveLength(1);
    expect(data.files![0]).toMatchObject({ name: 'raport.pdf', type: 'application/pdf' });
    expect(clicked).toHaveLength(0);
  });

  it('does nothing more when the teacher closes the share sheet', async () => {
    setShare(async () => Promise.reject(new DOMException('closed', 'AbortError')));
    expect(await shareFile(blob(), 'raport.pdf', 'Raportul clasei')).toBe('cancelled');
    expect(clicked).toHaveLength(0);
  });

  it('downloads the PDF when the browser cannot share files', async () => {
    setShare(undefined, undefined);
    expect(await shareFile(blob(), 'raport.pdf', 'Raportul clasei')).toBe('downloaded');
    expect(clicked).toEqual([{ download: 'raport.pdf', href: 'blob:test-1' }]);
  });

  it('downloads the PDF when the browser can share, but not this file', async () => {
    const share = vi.fn(async (_data: ShareData) => undefined);
    setShare(share, false);
    expect(await shareFile(blob(), 'raport.pdf', 'Raportul clasei')).toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
  });

  it('downloads the PDF when the share sheet refuses because the tap is too old', async () => {
    setShare(async () => Promise.reject(new DOMException('no gesture', 'NotAllowedError')));
    expect(await shareFile(blob(), 'raport.pdf', 'Raportul clasei')).toBe('downloaded');
    expect(clicked).toHaveLength(1);
  });
});
