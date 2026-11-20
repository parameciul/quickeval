import { saveFile, shareFile, type ShareResult } from '../admin/pdf/share.ts';
import { t } from '../i18n/t.ts';

// The result ticket as a picture for the phone's gallery: what the ticket on
// the page shows, drawn on a canvas in the browser. Always light, whatever
// the page's theme: it is a picture to keep, and phones read a dark QR code
// on white best. It holds no grade and no points.

// What the ticket is for and how it is used: a lead line, a note, an intro
// line, then the options, numbered.
export interface TicketHow {
  lead: string;
  note: string;
  intro: string;
  steps: readonly string[];
}

export interface TicketPicture {
  // What the picture is ("Biletul tău pentru rezultat"): a picture
  // found later in the gallery says it holds the student's result link.
  label: string;
  testTitle: string;
  studentName: string;
  // "Clasa 6E2 · 6E2-26T1".
  classLine: string;
  // The code as shown ("K7M-92P"), or null for a link without one.
  code: string | null;
  // What it is for and how it is used: up to two lines of lead, of note and
  // of intro, three of each option. An empty note draws nothing.
  how: TicketHow;
  // The QR code of the result link, already drawn (a canvas of the QR library).
  qr: CanvasImageSource;
}

export const TICKET_WIDTH = 1080;
export const TICKET_HEIGHT = 1840;

const MARGIN = 80;
// The QR code's side in the picture, in pixels.
export const QR_SIZE = 520;
// A white edge around the QR code, which readers need.
const QR_EDGE = 28;
const FONT = '"Schibsted Grotesk", "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
const TEXT = '#0c1524';
const MUTED = '#4a566a';
const INK = '#1b5cc8';
const TINT = '#e6eefb';
const ORANGE = '#e2590b';

// Where an option's text starts, after its number.
const STEP_INDENT = 44;

const font = (weight: number, size: number) => `${weight} ${size}px ${FONT}`;

// "bilet-6E2-26T1-Pop-Ion.png": letters without their marks, so every phone
// can store the name.
export function ticketFileName(testCode: string, studentName: string): string {
  const clean = [testCode, studentName]
    .map((part) =>
      part
        .normalize('NFD')
        .replace(/\p{M}+/gu, '')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    )
    .filter((part) => part !== '');
  return `${[t('bilet'), ...clean].join('-')}.png`;
}

// Breaks a text into lines no wider than `width`, at most `maxLines`; what
// does not fit ends in "…". A single word wider than the line stays whole.
export function wrapLines(measure: (text: string) => number, text: string, width: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter((word) => word !== '');
  const lines: string[] = [];
  let line = '';
  for (let index = 0; index < words.length; index++) {
    const next = line === '' ? words[index]! : `${line} ${words[index]}`;
    if (line === '' || measure(next) <= width) {
      line = next;
      continue;
    }
    if (lines.length === maxLines - 1) {
      // The last line allowed: cut words until "…" fits.
      let cut = line;
      while (cut.includes(' ') && measure(t('{cut}…', { cut })) > width) cut = cut.slice(0, cut.lastIndexOf(' '));
      lines.push(t('{cut}…', { cut }));
      return lines;
    }
    lines.push(line);
    line = words[index]!;
  }
  if (line !== '') lines.push(line);
  return lines;
}

// The MQGrader mark: three arcs of one ring, two blue and one orange.
function drawMark(context: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const scale = size / 64;
  const arcs: [number, string][] = [
    [-78, INK],
    [42, INK],
    [162, ORANGE],
  ];
  context.lineWidth = 7 * scale;
  context.lineCap = 'butt';
  for (const [start, colour] of arcs) {
    context.beginPath();
    context.strokeStyle = colour;
    context.arc(x + 32 * scale, y + 32 * scale, 18 * scale, (start * Math.PI) / 180, ((start + 96) * Math.PI) / 180);
    context.stroke();
  }
}

// Draws the whole picture. The canvas is TICKET_WIDTH by TICKET_HEIGHT.
export function drawTicket(context: CanvasRenderingContext2D, picture: TicketPicture): void {
  const centre = TICKET_WIDTH / 2;
  const inner = TICKET_WIDTH - 2 * MARGIN;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, TICKET_WIDTH, TICKET_HEIGHT);

  // The site's lockup, top left.
  drawMark(context, MARGIN, MARGIN, 96);
  context.textBaseline = 'alphabetic';
  context.textAlign = 'left';
  context.fillStyle = TEXT;
  context.font = font(700, 46);
  context.fillText('MQGrader', MARGIN + 116, MARGIN + 50);
  context.fillStyle = MUTED;
  context.font = font(400, 28);
  context.fillText('by Laura Miron', MARGIN + 116, MARGIN + 88);

  // What the picture is, then the test and the student.
  context.textAlign = 'center';
  context.fillStyle = INK;
  context.font = font(600, 36);
  context.fillText(picture.label, centre, 262);
  context.fillStyle = TEXT;
  context.font = font(700, 60);
  let y = 345;
  for (const line of wrapLines((text) => context.measureText(text).width, picture.testTitle, inner, 2)) {
    context.fillText(line, centre, y);
    y += 72;
  }
  context.fillStyle = MUTED;
  context.font = font(400, 34);
  const who = [picture.studentName, picture.classLine].filter((part) => part !== '').join(' · ');
  for (const line of wrapLines((text) => context.measureText(text).width, who, inner, 2)) {
    context.fillText(line, centre, y - 8);
    y += 46;
  }

  // The QR code, lower when there is no code under it.
  const qrTop = picture.code ? 580 : 670;
  context.fillStyle = '#ffffff';
  context.fillRect(centre - QR_SIZE / 2 - QR_EDGE, qrTop - QR_EDGE, QR_SIZE + 2 * QR_EDGE, QR_SIZE + 2 * QR_EDGE);
  context.imageSmoothingEnabled = false;
  context.drawImage(picture.qr, centre - QR_SIZE / 2, qrTop, QR_SIZE, QR_SIZE);

  if (picture.code) {
    context.fillStyle = TINT;
    context.fillRect(MARGIN, 1150, inner, 150);
    context.textAlign = 'left';
    context.fillStyle = MUTED;
    context.font = font(400, 34);
    context.fillText(t('Codul tău'), MARGIN + 40, 1238);
    context.textAlign = 'right';
    context.fillStyle = INK;
    context.font = font(700, 92);
    context.fillText(picture.code, TICKET_WIDTH - MARGIN - 40, 1258);
  }

  // What it is for, then how to use it: the intro, then the options
  // numbered, each wrapped under its own text. Without options all is centred.
  const left = MARGIN + 40;
  const width = inner - 80;
  const measure = (text: string) => context.measureText(text).width;
  const steps = picture.how.steps;
  const alone = steps.length === 0;
  context.textAlign = alone ? 'center' : 'left';
  y = 1370;
  context.fillStyle = INK;
  context.font = font(700, 32);
  for (const line of wrapLines(measure, picture.how.lead, alone ? inner : width, 2)) {
    context.fillText(line, alone ? centre : left, y);
    y += 42;
  }
  context.fillStyle = MUTED;
  context.font = font(400, 30);
  for (const line of wrapLines(measure, picture.how.note, alone ? inner : width, 2)) {
    context.fillText(line, alone ? centre : left, y);
    y += 40;
  }
  y += 28;
  context.fillStyle = TEXT;
  context.font = font(600, 30);
  for (const line of wrapLines(measure, picture.how.intro, alone ? inner : width, 2)) {
    context.fillText(line, alone ? centre : left, y);
    y += 40;
  }
  context.fillStyle = MUTED;
  context.font = font(400, 30);
  steps.forEach((step, index) => {
    y += 12;
    context.fillText(`${index + 1}.`, left, y);
    for (const line of wrapLines(measure, step, width - STEP_INDENT, 3)) {
      context.fillText(line, left + STEP_INDENT, y);
      y += 40;
    }
  });
}

// The picture as a PNG file. Waits for the page's font first, so the picture
// has the site's letters; without it the system font is used.
export async function renderTicket(picture: TicketPicture): Promise<Blob> {
  try {
    await document.fonts?.load(font(700, 60));
    await document.fonts?.ready;
  } catch {
    // The picture is drawn with the system font.
  }
  const canvas = document.createElement('canvas');
  canvas.width = TICKET_WIDTH;
  canvas.height = TICKET_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no canvas');
  drawTicket(context, picture);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      // Phones limit canvas memory: free this one at once.
      canvas.width = 0;
      canvas.height = 0;
      if (blob) resolve(blob);
      else reject(new Error('no picture'));
    }, 'image/png');
  });
}

// An iPhone or iPad saves a picture to its gallery from the share sheet
// ("Save Image"); a download there goes to Files, where students do not look.
// An iPad says it is a Mac, but a Mac has no touch screen.
export function savesThroughShare(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

// Gives the picture to the phone: the share sheet on an iPhone or iPad (a
// download when it refuses), a download everywhere else.
export async function saveTicket(blob: Blob, fileName: string, title: string): Promise<ShareResult> {
  if (savesThroughShare()) return shareFile(blob, fileName, title);
  saveFile(blob, fileName);
  return 'downloaded';
}
