import { describe, expect, it, vi } from 'vitest';
import { MAX_STUDENT_FILES } from '../../../shared/files.ts';
import { ApiError } from '../../ui/ApiError.ts';
import type { LandingApi } from './api.ts';
import { formProblem, sendTry, tryTitle, type TryForm } from './send.ts';

const TOKEN = 'abcdefghijkmnopqrstuvwxyz2345672';
const NOW = new Date('2026-11-10T08:00:00.000Z');

const pdf = (name: string) => new File(['%PDF-1.7'], name, { type: 'application/pdf' });
const photo = (name: string) => new File(['jpg'], name, { type: 'image/jpeg' });

function fakeLandingApi() {
  const calls: string[] = [];
  const api = {
    availability: vi.fn(async () => ({ dailyLimitReached: false, admin: false, siteKey: 'site' })),
    create: vi.fn(async (_turnstileToken?: string, _title?: string) => {
      calls.push('create');
      return { token: TOKEN, code: 'PROBA-26T1' };
    }),
    uploadTestFile: vi.fn(async (_token: string, _code: string, kind: 'test' | 'barem', file: File) => void calls.push(`${kind}:${file.name}`)),
    generateBarem: vi.fn(async () => void calls.push('generate')),
    addPage: vi.fn(async (_token: string, file: File) => void calls.push(`page:${file.name}`)),
    start: vi.fn(async () => void calls.push('start')),
    getTest: vi.fn(),
  } satisfies LandingApi;
  return { api, calls };
}

const full: TryForm = { title: '', test: pdf('test.pdf'), barem: pdf('barem.pdf'), robotBarem: false, pages: [photo('p1.jpg'), photo('p2.jpg')] };

describe('the form before it is sent', () => {
  it('asks for the test, a barem or the robot, and the pages', () => {
    expect(formProblem({ ...full, test: null })).toBe('Alege fișierul testului.');
    expect(formProblem({ ...full, barem: null })).toBe('Alege fișierul baremului sau cere ca baremul să fie făcut din test.');
    expect(formProblem({ ...full, pages: [] })).toBe('Alege pozele sau PDF-ul lucrării.');
    expect(formProblem(full)).toBeNull();
    expect(formProblem({ ...full, barem: null, robotBarem: true })).toBeNull();
  });

  it("checks each file like the app: the type, an empty file, the size, the pages' count", () => {
    expect(formProblem({ ...full, test: photo('test.jpg') })).toBe('Testul: Încarcă un fișier PDF sau Word (.docx).');
    expect(formProblem({ ...full, barem: new File([], 'barem.pdf', { type: 'application/pdf' }) })).toBe('Baremul: Fișierul este gol.');
    const big = pdf('p.pdf');
    Object.defineProperty(big, 'size', { value: 26 * 1024 * 1024 });
    expect(formProblem({ ...full, pages: [big] })).toBe('p.pdf: Fișierul are peste 25 MB.');
    expect(formProblem({ ...full, pages: [new File(['x'], 'p.heic', { type: 'image/heic' })] })).toBe('p.heic: Trimite poze JPG sau PDF.');
    const many = Array.from({ length: MAX_STUDENT_FILES + 1 }, (_, i) => photo(`p${i}.jpg`));
    expect(formProblem({ ...full, pages: many })).toBe(`Poți trimite cel mult ${MAX_STUDENT_FILES} de fișiere.`);
  });

  it('takes her barem over the robot when she gives both', () => {
    expect(formProblem({ ...full, robotBarem: true })).toBeNull();
  });
});

describe("the try's name", () => {
  it('is the name she writes, else the name of the test file', () => {
    expect(tryTitle({ ...full, title: '  Test   funcții 9B ' })).toBe('Test funcții 9B');
    expect(tryTitle(full)).toBe('test');
    expect(tryTitle({ ...full, test: pdf('Teză  semestrul I.final.docx') })).toBe('Teză semestrul I.final');
    expect(tryTitle({ ...full, test: pdf('.pdf') })).toBe('');
    expect(tryTitle({ ...full, test: null })).toBe('');
  });

  it('is cut to the length a test title may have', () => {
    expect(tryTitle({ ...full, title: 'x'.repeat(200) })).toHaveLength(120);
    expect(tryTitle({ ...full, test: pdf(`${'y'.repeat(200)}.pdf`) })).toHaveLength(120);
  });
});

describe('sending a try', () => {
  it('makes the try, sends the files in order and starts the grading with her barem', async () => {
    const { api, calls } = fakeLandingApi();
    const created = vi.fn();
    const progress = vi.fn();
    const stored = await sendTry(api, full, 'raspuns', { onCreated: created, onProgress: progress }, () => NOW);
    expect(calls).toEqual(['create', 'test:test.pdf', 'barem:barem.pdf', 'page:p1.jpg', 'page:p2.jpg', 'start']);
    expect(api.create).toHaveBeenCalledWith('raspuns', 'test');
    expect(stored).toEqual({ token: TOKEN, code: 'PROBA-26T1', madeAt: NOW.toISOString() });
    expect(created).toHaveBeenCalledWith(stored);
    expect(progress.mock.calls.map(([text]) => text)).toEqual([
      'Se pregătește încercarea…',
      'Se trimite testul…',
      'Se trimite baremul…',
      'Se trimit paginile lucrării: 1 din 2…',
      'Se trimit paginile lucrării: 2 din 2…',
      'Se pornește corectarea…',
    ]);
  });

  it('asks for the barem and does not start: she reads it first', async () => {
    const { api, calls } = fakeLandingApi();
    await sendTry(api, { ...full, barem: null, robotBarem: true }, undefined, { onCreated: vi.fn(), onProgress: vi.fn() }, () => NOW);
    expect(calls).toEqual(['create', 'test:test.pdf', 'generate', 'page:p1.jpg', 'page:p2.jpg']);
    expect(api.create).toHaveBeenCalledWith(undefined, 'test');
  });

  it('keeps the try as soon as it is made, so a send that breaks half-way can go on from its page', async () => {
    const { api, calls } = fakeLandingApi();
    api.addPage.mockRejectedValueOnce(new ApiError(0, 'network', 'Nu mă pot conecta la server.'));
    const created = vi.fn();
    await expect(sendTry(api, full, 'raspuns', { onCreated: created, onProgress: vi.fn() }, () => NOW)).rejects.toMatchObject({ code: 'network' });
    expect(created).toHaveBeenCalledWith({ token: TOKEN, code: 'PROBA-26T1', madeAt: NOW.toISOString() });
    expect(calls).not.toContain('start');
  });

  it('keeps nothing when the try is refused', async () => {
    const { api } = fakeLandingApi();
    api.create.mockRejectedValueOnce(new ApiError(429, 'quick_try_ip_limit', 'Limita'));
    const created = vi.fn();
    await expect(sendTry(api, full, 'raspuns', { onCreated: created, onProgress: vi.fn() }, () => NOW)).rejects.toMatchObject({ status: 429 });
    expect(created).not.toHaveBeenCalled();
    expect(api.uploadTestFile).not.toHaveBeenCalled();
  });
});
