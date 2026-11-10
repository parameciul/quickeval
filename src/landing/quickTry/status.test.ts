import { describe, expect, it } from 'vitest';
import { PDF_TYPE } from '../../../shared/files.ts';
import { tryTest } from '../../test/fakeTryApi.tsx';
import { canStart, statusOf } from './status.ts';

const files = { test: { name: 'test.pdf', type: PDF_TYPE }, barem: { name: 'barem.pdf', type: PDF_TYPE } };
const TOKEN = 'abcdefghijkmnopqrstuvwxyz2345672';
const today = { token: TOKEN, code: 'PROBA-26T1', madeAt: '2026-11-10T08:00:00.000Z' };
const now = new Date('2026-11-10T12:00:00.000Z');
const open = { dailyLimitReached: false, admin: false, siteKey: 'site' };

describe('the status line under the button', () => {
  it('follows the robot while it makes the barem, then waits for her start', () => {
    expect(statusOf(tryTest({ files: { ...files, barem: null }, barem: { request: 'requested', unchecked: false } }))).toEqual({
      text: 'Se face baremul…',
      working: true,
      tone: 'work',
      label: 'Se face baremul',
    });
    expect(statusOf(tryTest({ files, barem: { request: 'none', unchecked: true } }))).toEqual({
      text: 'Baremul este gata. Deschide încercarea ca să-l citești și să pornești corectarea.',
      working: false,
      tone: 'you',
      label: 'Baremul e gata',
    });
  });

  it('follows the grading to the graded paper', () => {
    expect(statusOf(tryTest({ status: 'evaluating', files }, { status: 'submitted' }))).toEqual({
      text: 'Se corectează… Durează câteva minute.',
      working: true,
      tone: 'work',
      label: 'Se corectează',
    });
    expect(statusOf(tryTest({ status: 'done', files }, { status: 'graded' }))).toEqual({
      text: 'Lucrarea este corectată.',
      working: false,
      tone: 'ok',
      label: 'Corectată',
    });
  });

  it('says how many points of the graded paper wait for her check', () => {
    expect(statusOf(tryTest({ status: 'done', files }, { status: 'graded', flagCount: 2 }))).toEqual({
      text: 'Lucrarea este corectată. Robotul nu a fost sigur de câteva puncte: verifică-le.',
      working: false,
      tone: 'you',
      label: '2 puncte de verificat',
    });
    expect(statusOf(tryTest({ status: 'done', files }, { status: 'graded', flagCount: 1 })).label).toBe('1 punct de verificat');
  });

  it("names what waits for her: the barem's problem, or a file the form did not send", () => {
    const problem = tryTest({ status: 'evaluating', files, exerciseList: { status: 'problem', message: 'Punctajele dau 9.' } }, { status: 'submitted' });
    expect(statusOf(problem)).toEqual({
      text: 'Baremul are o problemă. Deschide încercarea ca să alegi ce faci.',
      working: false,
      tone: 'you',
      label: 'Ai de ales',
    });
    expect(statusOf(tryTest({ files: { ...files, barem: null } }))).toEqual({
      text: 'Corectarea nu a pornit încă. Deschide încercarea ca să trimiți ce lipsește și s-o pornești.',
      working: false,
      tone: 'you',
      label: 'Nu a pornit',
    });
  });

  it('says a failed try does not count, so she may make another today', () => {
    expect(statusOf(tryTest({ files, barem: { request: 'failed', unchecked: false } }))).toEqual({
      text: 'Încercarea nu a reușit. Nu se numără: poți face alta azi.',
      working: false,
      tone: 'off',
      label: 'Nu a reușit',
    });
  });
});

describe('whether she may make a try now', () => {
  it('lets her make one when the day has room and this device made none today', () => {
    expect(canStart(open, null, null, now)).toBe('yes');
    expect(canStart(open, { ...today, madeAt: '2026-11-09T08:00:00.000Z' }, 'graded', now)).toBe('yes');
  });

  it("keeps one try per device per day, unless today's failed", () => {
    expect(canStart(open, today, 'grading', now)).toBe('used');
    expect(canStart(open, today, null, now)).toBe('used');
    expect(canStart(open, today, 'failed', now)).toBe('yes');
  });

  it("says when the platform's tries for today are all used", () => {
    expect(canStart({ ...open, dailyLimitReached: true }, null, null, now)).toBe('full');
  });

  it('lets an administrator make as many as she wants', () => {
    expect(canStart({ ...open, admin: true, dailyLimitReached: true }, today, 'grading', now)).toBe('yes');
  });

  it('cannot start without the Turnstile key, except for an administrator', () => {
    expect(canStart({ ...open, siteKey: null }, null, null, now)).toBe('off');
    expect(canStart({ ...open, siteKey: null, admin: true }, null, null, now)).toBe('yes');
  });
});
