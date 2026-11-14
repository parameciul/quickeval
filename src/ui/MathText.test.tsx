import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MathText } from './MathText.tsx';

function draw(text: string): HTMLElement {
  return render(
    <p>
      <MathText text={text} />
    </p>,
  ).container.querySelector('p')!;
}

describe('MathText', () => {
  it('keeps a text without math as one plain text', () => {
    const text = 'Corect! Intersecția (−5; 2] ∩ [−1; 7) este [−1; 2].';
    const paragraph = draw(text);
    expect(paragraph.childNodes).toHaveLength(1);
    expect(paragraph).toHaveTextContent(text);
  });

  it('draws the bar of a root over the radicand', () => {
    const paragraph = draw('4 > √15 ≈ 3,87');
    const root = paragraph.querySelector('.math-root')!;
    expect(root.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(root.querySelector('.math-radicand')).toHaveTextContent('15');
    expect(root.querySelector('.sr-only')).toHaveTextContent('√');
    expect(paragraph.textContent).toBe('4 > √15 ≈ 3,87');
  });

  it('shows the index of a cube root', () => {
    expect(draw('∛8 = 2').querySelector('.math-root')).toHaveAttribute('data-index', '3');
    expect(draw('√9 = 3').querySelector('.math-root')).not.toHaveAttribute('data-index');
  });

  it('stands a fraction on two levels and keeps its slash and brackets for screen readers', () => {
    const paragraph = draw('Din −2 ≤ (x + 1)/3 < 1 rezultă −7 ≤ x < 2.');
    const fraction = paragraph.querySelector('.math-fraction')!;
    expect(fraction.querySelector('.math-numerator')!.textContent).toBe('(x + 1)');
    expect(fraction.querySelector('.math-denominator')!.textContent).toBe('3');
    expect([...fraction.querySelectorAll('.sr-only')].map((span) => span.textContent)).toEqual(['(', ')', '/']);
    expect(paragraph.textContent).toBe('Din −2 ≤ (x + 1)/3 < 1 rezultă −7 ≤ x < 2.');
  });

  it('draws the bar of a negation over its letter and keeps the combining bar for screen readers', () => {
    const text = 'Negația nu este p̄ → q̄ ∨ r̄.';
    const paragraph = draw(text);
    const bars = [...paragraph.querySelectorAll('.math-bar')];
    expect(bars.map((bar) => bar.textContent)).toEqual(['p̄', 'q̄', 'r̄']);
    expect(bars[0]!.querySelector('.sr-only')!.textContent).toBe('̄');
    expect(paragraph.textContent).toBe(text);
  });

  it('writes what follows "_" as a subscript and keeps "_" and the brackets for screen readers', () => {
    const text = 'Nu ai rezolvat acest exercițiu. A_p = [−1; 3], A_(p∧q) = [2; 3].';
    const paragraph = draw(text);
    const subs = [...paragraph.querySelectorAll('sub.math-sub')];
    expect(subs.map((sub) => sub.textContent)).toEqual(['_p', '_(p∧q)']);
    expect([...subs[1]!.querySelectorAll('.sr-only')].map((span) => span.textContent)).toEqual(['_(', ')']);
    expect(paragraph.querySelector('.math-word')!.textContent).toBe('A_p');
    expect(paragraph.textContent).toBe(text);
  });

  it('keeps a drawn root on one line with the characters that touch it', () => {
    const word = draw('intervalului (3; √15). Apoi').querySelector('.math-word')!;
    expect(word.textContent).toBe('√15).');
  });
});
