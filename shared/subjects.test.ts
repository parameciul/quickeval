import { describe, expect, it } from 'vitest';
import { DETECTED_SUBJECTS, isDetectedSubject, SUBJECT_NAMES, SUBJECTS, unsupportedMessage } from './subjects.ts';

describe('subjects', () => {
  it('lists the seven subjects in order, each with its name, and alta for any other', () => {
    expect(SUBJECTS).toEqual(['matematica', 'fizica', 'chimie', 'biologie', 'stiinte', 'romana', 'engleza']);
    expect(SUBJECTS.map((subject) => SUBJECT_NAMES[subject])).toEqual([
      'Matematică',
      'Fizică',
      'Chimie',
      'Biologie',
      'Științe',
      'Limba română',
      'Limba engleză',
    ]);
    expect(DETECTED_SUBJECTS).toEqual([...SUBJECTS, 'alta']);
  });

  it('tells a value of the list or alta from anything else', () => {
    expect(isDetectedSubject('fizica')).toBe(true);
    expect(isDetectedSubject('alta')).toBe(true);
    expect(isDetectedSubject('istorie')).toBe(false);
    expect(isDetectedSubject(undefined)).toBe(false);
    expect(isDetectedSubject(3)).toBe(false);
  });

  it('names the subject that is not graded, and the ones that are', () => {
    expect(unsupportedMessage('istorie')).toBe(
      'Testul pare să fie de istorie. MQGrader corectează acum: matematică, fizică, chimie, biologie, științe, limba română și limba engleză.',
    );
    expect(unsupportedMessage('  ')).toBe(
      'Testul nu pare să fie de o materie pe care o corectăm. MQGrader corectează acum: matematică, fizică, chimie, biologie, științe, limba română și limba engleză.',
    );
  });
});
