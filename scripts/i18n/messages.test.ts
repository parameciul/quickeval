import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MESSAGES_EN, SLOT, translateLines, translateMessage } from '../../shared/i18n/messages.ts';
import { scanFiles, sourceFiles } from './scan.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// The values of a message, in order: "{}" kept as it is, "{*}" translated.
const placeholders = (text: string) => (text.match(SLOT) ?? []).join('');
// Romanian left in an English text: its letters, or one of its common words.
const ROMANIAN = /[ăâîșțĂÂÎȘȚ]|\b(și|sau|din|pentru|este|sunt|nu|cu|pe|de|lucrar\w*|elev\w*|testul|clasa|barem\w*)\b/i;
const messages = () => scanFiles(ROOT, sourceFiles(ROOT, ['server', 'shared', 'functions'])).map(({ text }) => text.replace(/\{\}/g, '7'));

describe('the messages of the API and the shared code', () => {
  // Each Romanian message of server/ and shared/ (a "{}" for each value it
  // takes) has its English in shared/i18n/messages.ts.
  it('all have their English', () => {
    const missing = messages().filter((sample) => translateMessage(sample, 'en') === sample);
    expect(missing).toEqual([]);
  });

  // A message whose English only translated one of its values, or that kept
  // Romanian words, would pass the check above.
  it('leave no Romanian in their English', () => {
    const left = messages()
      .map((sample) => translateMessage(sample, 'en'))
      .filter((english) => ROMANIAN.test(english));
    expect(left).toEqual([]);
    const dictionary = Object.values(MESSAGES_EN).filter((english) => ROMANIAN.test(english.replace(SLOT, '7')));
    expect(dictionary).toEqual([]);
  });

  it('keep the same values, in the same order, in English as in Romanian', () => {
    const wrong = Object.entries(MESSAGES_EN).filter(([romanian, english]) => placeholders(romanian) !== placeholders(english));
    expect(wrong).toEqual([]);
  });

  it('fill the values, and translate a value marked {*} that the dictionary knows', () => {
    expect(translateMessage('Titlul are cel mult 120 de caractere.', 'en')).toBe('The title has at most 120 characters.');
    expect(translateMessage('Testul pare să fie de Fizică. MQGrader corectează acum: matematică, fizică, chimie, biologie, științe, limba română și limba engleză.', 'en')).toBe(
      'The test seems to be Physics. MQGrader grades now: mathematics, physics, chemistry, biology, science, Romanian and English.',
    );
    expect(translateMessage('Elevii „Ana”, „Ion”, „Eva” și încă 2 sunt deja în clasă.', 'en')).toBe('The students „Ana”, „Ion”, „Eva” and 2 more are already in the class.');
    expect(translateMessage('Clasa 7E2 există deja în anul școlar 2026-2027.', 'en')).toBe('Class 7E2 already exists in the school year 2026-2027.');
  });

  // A teacher, a student or a title may be named like a word the dictionary
  // knows: a name stays as it is.
  it('keep a name, a title or a number as it is, with a decimal point in English', () => {
    expect(translateMessage('Bună, Nota!', 'en')).toBe('Hello, Nota!');
    expect(translateMessage('Elevul Matematică este deja în clasă.', 'en')).toBe('The student Matematică is already in the class.');
    expect(translateMessage('Punctajul este între 0 și 2,5, din 0,05 în 0,05.', 'en')).toBe('The points are between 0 and 2.5, in steps of 0.05.');
  });

  it('leave Romanian, and a message they do not know, unchanged', () => {
    expect(translateMessage('Titlul are cel mult 120 de caractere.', 'ro')).toBe('Titlul are cel mult 120 de caractere.');
    expect(translateMessage('Punctajul este între 0 și 2,5, din 0,05 în 0,05.', 'ro')).toBe('Punctajul este între 0 și 2,5, din 0,05 în 0,05.');
    expect(translateMessage('Ceva nou.', 'en')).toBe('Ceva nou.');
  });

  it('translate an email line by line', () => {
    expect(translateLines('Bună, Ana!\n\nhttps://mqgrader.ro/x', 'en')).toBe('Hello, Ana!\n\nhttps://mqgrader.ro/x');
  });
});
