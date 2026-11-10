import type { QuickTryAvailability, TestDetail } from '../../../shared/api.ts';
import { phaseOf, type TryPhase } from '../../try/phase.ts';
import { usedToday, type StoredTry } from './storage.ts';

// The status line under the button (spec §3.1): what the try waits for, and
// whether the robot works for it (the line then reads the test again).
export function statusOf(detail: TestDetail): { text: string; working: boolean } {
  const phase = phaseOf(detail);
  const { barem, files } = detail.test;
  if (phase === 'failed') return { text: 'Încercarea nu a reușit. Nu se numără: poți face alta azi.', working: false };
  if (phase === 'graded') return { text: 'Lucrarea este corectată.', working: false };
  if (phase === 'grading') return { text: 'Se corectează… Durează câteva minute.', working: true };
  if (phase === 'problem') return { text: 'Baremul are o problemă. Deschide încercarea ca să alegi ce faci.', working: false };
  if (barem.request === 'requested') return { text: 'Se face baremul…', working: true };
  if (barem.unchecked && files.barem) {
    return { text: 'Baremul este gata. Deschide încercarea ca să-l citești și să pornești corectarea.', working: false };
  }
  return { text: 'Corectarea nu a pornit încă. Deschide încercarea ca să trimiți ce lipsește și s-o pornești.', working: false };
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
