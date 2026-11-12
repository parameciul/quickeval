// The subjects MQGrader grades (spec: any subject). The robot finds a test's
// subject once, with its exercise list or its generated barem; `alta` is a
// subject it does not grade, kept with its Romanian name for the message.

export const SUBJECTS = ['matematica', 'fizica', 'chimie', 'biologie', 'stiinte', 'romana', 'engleza'] as const;

export type Subject = (typeof SUBJECTS)[number];

// What the robot may answer: a subject of the list, or another one.
export const DETECTED_SUBJECTS = [...SUBJECTS, 'alta'] as const;

export type DetectedSubject = (typeof DETECTED_SUBJECTS)[number];

// The names the pages show, in the order of SUBJECTS.
export const SUBJECT_NAMES: Record<Subject, string> = {
  matematica: 'Matematică',
  fizica: 'Fizică',
  chimie: 'Chimie',
  biologie: 'Biologie',
  stiinte: 'Științe',
  romana: 'Limba română',
  engleza: 'Limba engleză',
};

// The subject of a test as the teacher app sees it. `name` is the Romanian
// name of an `alta` subject ("istorie"), "" otherwise; `by` says who set it.
export interface SubjectInfo {
  value: DetectedSubject;
  name: string;
  by: 'robot' | 'teacher';
}

// The longest name of an `alta` subject that is kept.
export const MAX_SUBJECT_NAME = 60;

export const SUPPORTED_SUBJECTS_TEXT = 'matematică, fizică, chimie, biologie, științe, limba română și limba engleză';

// What the teacher reads when the robot found a subject it does not grade.
export function unsupportedMessage(name: string): string {
  const found = name.trim() ? `Testul pare să fie de ${name.trim()}.` : 'Testul nu pare să fie de o materie pe care o corectăm.';
  return `${found} MQGrader corectează acum: ${SUPPORTED_SUBJECTS_TEXT}.`;
}

export function isDetectedSubject(value: unknown): value is DetectedSubject {
  return typeof value === 'string' && (DETECTED_SUBJECTS as readonly string[]).includes(value);
}
