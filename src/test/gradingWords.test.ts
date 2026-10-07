import { describe, expect, it } from 'vitest';
import { expectNoGradingWords } from './gradingWords.ts';

describe('expectNoGradingWords', () => {
  it('lets ordinary Romanian text pass, "ai" and "ia" included', () => {
    expect(() => expectNoGradingWords('Ai trimis un fișier. Ia o poză clară a paginii.')).not.toThrow();
  });

  it.each([
    'Lucrarea e corectată de AI.',
    'Corectare cu IA',
    'Evaluare A.I.',
    'Notare I.A.',
    'Inteligența artificială corectează',
    'Corectat automat',
    'robotul',
  ])('catches "%s"', (text) => {
    expect(() => expectNoGradingWords(text)).toThrow();
  });

  it('reads the labels that screen readers say aloud', () => {
    document.body.innerHTML = '<button aria-label="Trimite la AI">Trimite</button>';
    expect(() => expectNoGradingWords()).toThrow();
    document.body.innerHTML = '';
  });
});
