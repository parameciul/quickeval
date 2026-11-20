import {
  fileProblem,
  MAX_STUDENT_FILES,
  STUDENT_FILE_TYPES,
  STUDENT_WRONG_TYPE,
  TEACHER_FILE_TYPES,
  TEACHER_WRONG_TYPE,
} from '../../../shared/files.ts';
import { cleanTitle, MAX_TITLE_LENGTH } from '../../../shared/tests.ts';
import type { LandingApi } from './api.ts';
import type { StoredTry } from './storage.ts';
import { t } from '../../i18n/t.ts';

// What the form holds (spec §3.2): the try's name, the test, her barem or
// the robot's, and the student's pages.
export interface TryForm {
  // The name she writes; may be empty.
  title: string;
  test: File | null;
  barem: File | null;
  // "Nu am barem": the barem is made from the test. Her own file wins.
  robotBarem: boolean;
  pages: File[];
  // "Cu telefonul": the pages come from the phone after the send, through
  // the QR code; the form sends none and does not start the grading.
  byPhone: boolean;
}

// Why the form cannot be sent yet, in Romanian; null when it can. The files
// are checked like the app's: the test and barem like a teacher's, the
// pages like a student's.
export function formProblem(form: TryForm): string | null {
  if (!form.test) return t('Alege fișierul testului.');
  const test = fileProblem(form.test, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE);
  if (test) return t('Testul: {test}', { test });
  if (form.barem) {
    const barem = fileProblem(form.barem, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE);
    if (barem) return t('Baremul: {barem}', { barem });
  } else if (!form.robotBarem) {
    return t('Alege fișierul baremului sau cere ca baremul să fie făcut din test.');
  }
  if (form.byPhone) return null;
  if (form.pages.length === 0) return t('Alege pozele sau PDF-ul lucrării.');
  if (form.pages.length > MAX_STUDENT_FILES) return t('Poți trimite cel mult {MAX_STUDENT_FILES} de fișiere.', { MAX_STUDENT_FILES });
  for (const page of form.pages) {
    const problem = fileProblem(page, STUDENT_FILE_TYPES, STUDENT_WRONG_TYPE);
    if (problem) return `${page.name}: ${problem}`;
  }
  return null;
}

// The try's name: the one she writes, else the test file's name without its
// extension (.pdf or .docx only: "Test cap. 3" keeps its dot), cut to a test
// title's length. Empty when neither has one: the
// server then gives the default name.
export function tryTitle(form: TryForm): string {
  const own = cleanTitle(form.title);
  const name = own || cleanTitle((form.test?.name ?? '').replace(/\.(pdf|docx)$/i, ''));
  return name.slice(0, MAX_TITLE_LENGTH).trim();
}

export interface SendEvents {
  // The try exists: keep its link now, so a send that breaks half-way goes
  // on from the try's page.
  onCreated(stored: StoredTry): void;
  onProgress(text: string): void;
}

// Makes the try and sends what the form holds, in order. With her barem the
// grading starts at once; with the robot's she starts it on the try's page,
// after she reads it (spec §3.3, state 2). With the phone it stops after
// the barem. A refusal throws its ApiError.
export async function sendTry(
  api: LandingApi,
  form: TryForm,
  turnstileToken: string | undefined,
  events: SendEvents,
  now: () => Date = () => new Date(),
): Promise<StoredTry> {
  events.onProgress(t('Se pregătește încercarea…'));
  const { token, code } = await api.create(turnstileToken, tryTitle(form));
  const stored: StoredTry = { token, code, madeAt: now().toISOString() };
  events.onCreated(stored);
  events.onProgress(t('Se trimite testul…'));
  await api.uploadTestFile(token, code, 'test', form.test!);
  if (form.barem) {
    events.onProgress(t('Se trimite baremul…'));
    await api.uploadTestFile(token, code, 'barem', form.barem);
  } else {
    events.onProgress(t('Se cere baremul…'));
    await api.generateBarem(token, code);
  }
  // With the phone, the QR window takes the pages and starts the grading.
  if (form.byPhone) return stored;
  for (const [index, page] of form.pages.entries()) {
    events.onProgress(t('Se trimit paginile lucrării: {v1} din {length}…', { v1: index + 1, length: form.pages.length }));
    await api.addPage(token, page);
  }
  if (form.barem) {
    events.onProgress(t('Se pornește corectarea…'));
    await api.start(token);
  }
  return stored;
}
