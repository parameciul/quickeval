import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MESSAGES_EN, translateLines, translateMessage } from '../../shared/i18n/messages.ts';
import { scanFiles, sourceFiles } from './scan.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const placeholders = (text: string) => (text.match(/\{\}/g) ?? []).length;

describe('the messages of the API and the shared code', () => {
  // Each Romanian message of server/ and shared/ (a "{}" for each value it
  // takes) has its English in shared/i18n/messages.ts.
  it('all have their English', () => {
    const missing = scanFiles(ROOT, sourceFiles(ROOT, ['server', 'shared', 'functions'])).filter(({ text }) => {
      const sample = text.replace(/\{\}/g, '7');
      return translateMessage(sample, 'en') === sample;
    });
    expect(missing).toEqual([]);
  });

  it('keep as many values in English as in Romanian', () => {
    const wrong = Object.entries(MESSAGES_EN).filter(([romanian, english]) => placeholders(romanian) !== placeholders(english));
    expect(wrong).toEqual([]);
  });

  it('fill the values, and translate a value the dictionary knows', () => {
    expect(translateMessage('Titlul are cel mult 120 de caractere.', 'en')).toBe('The title has at most 120 characters.');
    expect(translateMessage('Testul pare să fie de Fizică. MQGrader corectează acum: matematică, fizică, chimie, biologie, științe, limba română și limba engleză.', 'en')).toBe(
      'The test seems to be Physics. MQGrader grades now: mathematics, physics, chemistry, biology, science, Romanian and English.',
    );
    expect(translateMessage('Elevii „Ana”, „Ion”, „Eva” și încă 2 sunt deja în clasă.', 'en')).toBe('The students „Ana”, „Ion”, „Eva” and 2 more are already in the class.');
  });

  it('leave Romanian, and a message they do not know, unchanged', () => {
    expect(translateMessage('Titlul are cel mult 120 de caractere.', 'ro')).toBe('Titlul are cel mult 120 de caractere.');
    expect(translateMessage('Ceva nou.', 'en')).toBe('Ceva nou.');
  });

  it('translate an email line by line', () => {
    expect(translateLines('Bună, Ana!\n\nhttps://mqgrader.ro/x', 'en')).toBe('Hello, Ana!\n\nhttps://mqgrader.ro/x');
  });
});
