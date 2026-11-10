import type { QuickTryAvailability, TestDetail } from '../../../shared/api.ts';
import { paperOf, phaseOf, type TryPhase } from '../../try/phase.ts';
import { countLabel } from '../../ui/format.ts';
import { usedToday, type StoredTry } from './storage.ts';

// The colour of the card's tag: the robot works (blue), she has something to
// do (orange), the paper is graded and checked (green), the try failed (grey).
export type TryTone = 'work' | 'you' | 'ok' | 'off';

export interface TryStatus {
  // The line under the card's title.
  text: string;
  // The robot works for the try: the card reads the test again.
  working: boolean;
  tone: TryTone;
  // The card's tag.
  label: string;
}

// The card of her try (spec §3.1): what the try waits for, and whether the
// robot works for it.
export function statusOf(detail: TestDetail): TryStatus {
  const phase = phaseOf(detail);
  const { barem, files } = detail.test;
  if (phase === 'failed') return { text: 'Încercarea nu a reușit. Nu se numără: poți face alta azi.', working: false, tone: 'off', label: 'Nu a reușit' };
  if (phase === 'graded') {
    const flags = paperOf(detail)?.flagCount ?? 0;
    if (flags === 0) return { text: 'Lucrarea este corectată.', working: false, tone: 'ok', label: 'Corectată' };
    return {
      text: 'Lucrarea este corectată. Robotul nu a fost sigur de câteva puncte: verifică-le.',
      working: false,
      tone: 'you',
      label: countLabel(flags, 'punct de verificat', 'puncte de verificat'),
    };
  }
  if (phase === 'grading') return { text: 'Se corectează… Durează câteva minute.', working: true, tone: 'work', label: 'Se corectează' };
  if (phase === 'problem') {
    return { text: 'Baremul are o problemă. Deschide încercarea ca să alegi ce faci.', working: false, tone: 'you', label: 'Ai de ales' };
  }
  if (barem.request === 'requested') return { text: 'Se face baremul…', working: true, tone: 'work', label: 'Se face baremul' };
  if (barem.unchecked && files.barem) {
    return {
      text: 'Baremul este gata. Deschide încercarea ca să-l citești și să pornești corectarea.',
      working: false,
      tone: 'you',
      label: 'Baremul e gata',
    };
  }
  return {
    text: 'Corectarea nu a pornit încă. Deschide încercarea ca să trimiți ce lipsește și s-o pornești.',
    working: false,
    tone: 'you',
    label: 'Nu a pornit',
  };
}

// Whether the button may open the form: 'yes'; 'used' (this device made its
// try today and it did not fail); 'full' (the platform's tries for today are
// all used); 'off' (no Turnstile key, so only an administrator can make a
// try). An administrator always may.
export type StartAnswer = 'yes' | 'used' | 'full' | 'off';

export function canStart(availability: QuickTryAvailability, stored: StoredTry | null, phase: TryPhase | null, now: Date): StartAnswer {
  if (availability.admin) return 'yes';
  if (!availability.siteKey) return 'off';
  if (usedToday(stored, now) && phase !== 'failed') return 'used';
  if (availability.dailyLimitReached) return 'full';
  return 'yes';
}
