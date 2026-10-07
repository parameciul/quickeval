import { expect } from 'vitest';

// No student page may tell students how their work is graded. "AI" is checked
// in capitals only: "ai" is a common Romanian word ("you have").
export function expectNoGradingWords(text: string = document.body.textContent ?? ''): void {
  expect(text).not.toMatch(/\bAI\b/);
  expect(text.toLowerCase()).not.toMatch(/inteligen|claude|robot|automat/);
}
