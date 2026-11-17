import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveFile, shareFile } from '../admin/pdf/share.ts';
import {
  drawTicket,
  renderTicket,
  saveTicket,
  savesThroughShare,
  TICKET_HEIGHT,
  TICKET_WIDTH,
  ticketFileName,
  wrapLines,
  type TicketPicture,
} from './ticketImage.ts';

vi.mock('../admin/pdf/share.ts', () => ({ saveFile: vi.fn(), shareFile: vi.fn() }));

// Every letter is 10 wide: enough to test the line breaks.
const measure = (text: string) => text.length * 10;

// A canvas context that records what is drawn.
function fakeContext() {
  const texts: { text: string; x: number; y: number; font: string; fill: string; align: string }[] = [];
  const images: { source: unknown; x: number; y: number; width: number; height: number }[] = [];
  const rects: { fill: string; x: number; y: number; width: number; height: number }[] = [];
  const context = {
    fillStyle: '',
    strokeStyle: '',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    lineWidth: 1,
    lineCap: 'butt',
    imageSmoothingEnabled: true,
    fillRect(x: number, y: number, width: number, height: number) {
      rects.push({ fill: this.fillStyle, x, y, width, height });
    },
    fillText(text: string, x: number, y: number) {
      texts.push({ text, x, y, font: this.font, fill: this.fillStyle, align: this.textAlign });
    },
    measureText: (text: string) => ({ width: text.length * 20 }),
    drawImage(source: unknown, x: number, y: number, width: number, height: number) {
      images.push({ source, x, y, width, height });
    },
    beginPath: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
  };
  return { context: context as unknown as CanvasRenderingContext2D, texts, images, rects, arc: context.arc };
}

const QR = { qr: true } as unknown as CanvasImageSource;
const picture: TicketPicture = {
  testTitle: 'Fracții',
  studentName: 'Pop Ion',
  classLine: 'Clasa 6E2 · 6E2-26T1',
  code: 'K7M-92P',
  how: 'Scanează codul QR cu camera. Sau deschide linkul testului și scrie codul.',
  qr: QR,
};

function userAgent(value: string, touchPoints = 0) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(value);
  Object.defineProperty(navigator, 'maxTouchPoints', { value: touchPoints, configurable: true });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(saveFile).mockReset();
  vi.mocked(shareFile).mockReset();
  Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
});

describe('ticketFileName', () => {
  it('names the file by the test and the student, in plain letters', () => {
    expect(ticketFileName('6E2-26T1', 'Pop Ion')).toBe('bilet-6E2-26T1-Pop-Ion.png');
    expect(ticketFileName('6E2-26T1', 'Țîrcă Ștefăniță-Ion')).toBe('bilet-6E2-26T1-Tirca-Stefanita-Ion.png');
    expect(ticketFileName('6E2-26T1', '')).toBe('bilet-6E2-26T1.png');
  });
});

describe('wrapLines', () => {
  it('keeps a short text on one line', () => {
    expect(wrapLines(measure, 'Test la fracții', 300, 2)).toEqual(['Test la fracții']);
    expect(wrapLines(measure, '', 300, 2)).toEqual([]);
  });

  it('breaks at spaces, and ends what does not fit in "…"', () => {
    expect(wrapLines(measure, 'Test la fracții ordinare', 150, 2)).toEqual(['Test la fracții', 'ordinare']);
    expect(wrapLines(measure, 'Test de evaluare la fracții ordinare și zecimale', 150, 2)).toEqual(['Test de', 'evaluare la…']);
  });

  it('keeps a word wider than the line whole', () => {
    expect(wrapLines(measure, 'Electromagnetism', 100, 2)).toEqual(['Electromagnetism']);
  });
});

describe('drawTicket', () => {
  it('draws the lockup, the test, the student, the QR code, the code and how to use it', () => {
    const { context, texts, images, rects, arc } = fakeContext();
    drawTicket(context, picture);
    // A white ground over the whole picture, first.
    expect(rects[0]).toEqual({ fill: '#ffffff', x: 0, y: 0, width: TICKET_WIDTH, height: TICKET_HEIGHT });
    // The mark's three arcs.
    expect(arc).toHaveBeenCalledTimes(3);
    const written = texts.map((entry) => entry.text);
    expect(written).toEqual([
      'MQGrader',
      'by Laura Miron',
      'Fracții',
      'Pop Ion · Clasa 6E2 · 6E2-26T1',
      'Codul tău',
      'K7M-92P',
      'Scanează codul QR cu camera. Sau deschide',
      'linkul testului și scrie codul.',
    ]);
    // The QR code: square, in the middle, not smoothed.
    expect(images).toEqual([{ source: QR, x: 280, y: 470, width: 520, height: 520 }]);
    expect((context as unknown as { imageSmoothingEnabled: boolean }).imageSmoothingEnabled).toBe(false);
    // The code is the largest text.
    expect(texts.find((entry) => entry.text === 'K7M-92P')!.font).toMatch(/^700 92px /);
    // Everything stays inside the picture.
    for (const entry of texts) {
      expect(entry.y).toBeGreaterThan(0);
      expect(entry.y).toBeLessThan(TICKET_HEIGHT);
    }
  });

  it('draws no code for a link without one, and the QR code lower', () => {
    const { context, texts, images } = fakeContext();
    drawTicket(context, { ...picture, code: null, how: 'Scanează codul QR cu camera.' });
    const written = texts.map((entry) => entry.text);
    expect(written).not.toContain('Codul tău');
    expect(written).toContain('Scanează codul QR cu camera.');
    expect(images[0]!.y).toBe(560);
  });

  it('cuts a long test title to two lines', () => {
    const { context, texts } = fakeContext();
    drawTicket(context, { ...picture, testTitle: 'Test de evaluare sumativă la unitatea de învățare fracții ordinare și fracții zecimale periodice' });
    const title = texts.filter((entry) => entry.font.startsWith('700 60px'));
    expect(title).toHaveLength(2);
    expect(title[1]!.text.endsWith('…')).toBe(true);
  });

  it('never writes a grade, points or a word on how the work is graded', () => {
    const { context, texts } = fakeContext();
    drawTicket(context, picture);
    const all = texts.map((entry) => entry.text).join('\n');
    expect(all).not.toMatch(/\b(AI|IA|CES)\b/);
    expect(all.toLowerCase()).not.toMatch(/not[aă]|punct|robot|automat|inteligen/);
  });
});

describe('renderTicket', () => {
  it('draws on a canvas of the picture size, gives a PNG and frees the canvas', async () => {
    const { context } = fakeContext();
    const png = new Blob(['png'], { type: 'image/png' });
    const sizes: number[][] = [];
    const canvases: HTMLCanvasElement[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      sizes.push([this.width, this.height]);
      canvases.push(this);
      return context;
    } as never);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback: BlobCallback) {
      callback(png);
    });
    await expect(renderTicket(picture)).resolves.toBe(png);
    expect(sizes).toEqual([[TICKET_WIDTH, TICKET_HEIGHT]]);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
    // Phones limit canvas memory: the canvas is emptied once the PNG is made.
    expect([canvases[0]!.width, canvases[0]!.height]).toEqual([0, 0]);
  });

  it('fails when the browser gives no canvas or no picture', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(renderTicket(picture)).rejects.toThrow();
    const { context } = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback: BlobCallback) {
      callback(null);
    });
    await expect(renderTicket(picture)).rejects.toThrow();
  });
});

describe('saveTicket', () => {
  const blob = new Blob(['png'], { type: 'image/png' });

  it('downloads the picture on a phone that is not an iPhone', async () => {
    userAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36');
    expect(savesThroughShare()).toBe(false);
    await expect(saveTicket(blob, 'bilet.png', 'Pop Ion · Fracții')).resolves.toBe('downloaded');
    expect(saveFile).toHaveBeenCalledWith(blob, 'bilet.png');
    expect(shareFile).not.toHaveBeenCalled();
  });

  it('opens the share sheet on an iPhone, which has "Save Image"', async () => {
    userAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1');
    vi.mocked(shareFile).mockResolvedValue('shared');
    expect(savesThroughShare()).toBe(true);
    await expect(saveTicket(blob, 'bilet.png', 'Pop Ion · Fracții')).resolves.toBe('shared');
    expect(shareFile).toHaveBeenCalledWith(blob, 'bilet.png', 'Pop Ion · Fracții');
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('takes an iPad that says it is a Mac for what it is, and a Mac for a Mac', () => {
    const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
    userAgent(mac, 5);
    expect(savesThroughShare()).toBe(true);
    userAgent(mac, 0);
    expect(savesThroughShare()).toBe(false);
  });
});
