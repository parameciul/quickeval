import { expect } from 'vitest';

// No student page may tell students how their work is graded. "AI" and "IA"
// (the Romanian short form) are checked in capitals only: "ai" and "ia" are
// common Romanian words. With no text given, it checks the page, including the
// labels that screen readers read aloud. The CES mark is for the teacher only:
// a student page never says "CES" or that the student's test was adapted.
export function expectNoGradingWords(text: string = pageText()): void {
  expect(text).not.toMatch(/\b(AI|IA|CES)\b|\bA\.I\.|\bI\.A\./);
  expect(text.toLowerCase()).not.toMatch(/inteligen|intellig|artificial|claude|robot|automat|adaptat/);
}

function pageText(): string {
  const labels = [...document.body.querySelectorAll('[aria-label], [alt], [title], [placeholder]')].flatMap((element) =>
    ['aria-label', 'alt', 'title', 'placeholder'].map((name) => element.getAttribute(name) ?? ''),
  );
  return [document.body.textContent ?? '', ...labels].join('\n');
}
