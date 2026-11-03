import { describe, expect, it } from 'vitest';
import { hasMath, parseMath, type MathFraction, type MathNode, type MathRoot } from './mathText.ts';

// The text the page keeps for copying and for screen readers.
function plain(nodes: MathNode[]): string {
  return nodes
    .map((node) => {
      if (typeof node === 'string') return node;
      if (node.kind === 'root') return `${node.sign}${node.radicand.open}${plain(node.radicand.body)}${node.radicand.close}`;
      const { numerator: top, denominator: bottom } = node;
      return `${top.open}${plain(top.body)}${top.close}/${bottom.open}${plain(bottom.body)}${bottom.close}`;
    })
    .join('');
}

const root = (body: MathNode[], open = '', close = '', sign = '√', index = ''): MathRoot => ({ kind: 'root', sign, index, radicand: { open, body, close } });
const fraction = (top: MathNode[], bottom: MathNode[], topBrackets = false, bottomBrackets = false): MathFraction => ({
  kind: 'fraction',
  numerator: { open: topBrackets ? '(' : '', body: top, close: topBrackets ? ')' : '' },
  denominator: { open: bottomBrackets ? '(' : '', body: bottom, close: bottomBrackets ? ')' : '' },
});

describe('parseMath', () => {
  it('leaves a text without roots and slashes as it is', () => {
    expect(parseMath('Corect! Intersecția (−5; 2] ∩ [−1; 7) este [−1; 2].')).toEqual(['Corect! Intersecția (−5; 2] ∩ [−1; 7) este [−1; 2].']);
    expect(hasMath(parseMath('x² + 1 ≥ 1'))).toBe(false);
  });

  it('puts the bar of a root over the whole number', () => {
    expect(parseMath('4 > √15 ≈ 3,87, deci 4 nu aparține intervalului (3; √15).')).toEqual([
      '4 > ',
      root(['15']),
      ' ≈ 3,87, deci 4 nu aparține intervalului (3; ',
      root(['15']),
      ').',
    ]);
    expect(parseMath('2√7 = √28')).toEqual(['2', root(['7']), ' = ', root(['28'])]);
    expect(parseMath('√2,25 = 1,5')).toEqual([root(['2,25']), ' = 1,5']);
  });

  it('takes a bracket group or one letter as the radicand', () => {
    expect(parseMath('√(x + 1) = 3')).toEqual([root(['x + 1'], '(', ')'), ' = 3']);
    expect(parseMath('√x ≥ 0')).toEqual([root(['x']), ' ≥ 0']);
    expect(parseMath('∛8 = 2 și ∜16 = 2')).toEqual([root(['8'], '', '', '∛', '3'), ' = 2 și ', root(['16'], '', '', '∜', '4'), ' = 2']);
  });

  it('leaves a root sign without a radicand as text', () => {
    expect(parseMath('semnul √ și √ab și √ 2')).toEqual(['semnul √ și √ab și √ 2']);
  });

  it('stands a fraction of numbers, letters and groups on two levels', () => {
    expect(parseMath('10/3 ≈ 3,33')).toEqual([fraction(['10'], ['3']), ' ≈ 3,33']);
    expect(parseMath('Din −2 ≤ (x + 1)/3 < 1')).toEqual(['Din −2 ≤ ', fraction(['x + 1'], ['3'], true), ' < 1']);
    expect(parseMath('(2x − 1)/(x + 3)')).toEqual([fraction(['2x − 1'], ['x + 3'], true, true)]);
    expect(parseMath('din (−7/2; 2]')).toEqual(['din (−', fraction(['7'], ['2']), '; 2]']);
    expect(parseMath('x²/4 și π/2')).toEqual([fraction(['x²'], ['4']), ' și ', fraction(['π'], ['2'])]);
  });

  it('gives the numerator the pieces that touch it on the left', () => {
    expect(parseMath('2x/5')).toEqual([fraction(['2x'], ['5'])]);
    expect(parseMath('2√3/3')).toEqual([fraction(['2', root(['3'])], ['3'])]);
    expect(parseMath('√3/2')).toEqual([fraction([root(['3'])], ['2'])]);
    expect(parseMath('f(x)/2')).toEqual([fraction(['f(x)'], ['2'])]);
  });

  it('keeps the brackets of a group with a power', () => {
    expect(parseMath('(x + 1)²/4')).toEqual([fraction(['(x + 1)²'], ['4'])]);
  });

  it('draws a fraction under a root and a root in a fraction', () => {
    expect(parseMath('√(3/4)')).toEqual([root([fraction(['3'], ['4'])], '(', ')')]);
    expect(parseMath('1/√2')).toEqual([fraction(['1'], [root(['2'])])]);
  });

  it('leaves slashes between words, inside names and in chains as text', () => {
    for (const text of ['și/sau', 'km/h', 'I.1/I.2', '12/05/2026', '1/2/3', '1/2x', 'a / b', 'pagina2/3', 'x/ab']) {
      expect(parseMath(text)).toEqual([text]);
    }
  });

  it('never takes an interval as a radicand or a fraction part', () => {
    expect(parseMath('(1; 9]/2 și √(3; 4)')).toEqual(['(1; 9]/2 și √(3; 4)']);
    expect(parseMath('(5; 9] este (1; 9] \\ [−4; 5)')).toEqual(['(5; 9] este (1; 9] \\ [−4; 5)']);
  });

  it('keeps every character of the text', () => {
    const texts = [
      'Răspunsul nu este corect: 4 > √15 ≈ 3,87, deci 4 nu aparține intervalului (3; √15). Numărul corect este 10/3 ≈ 3,33, adică varianta d).',
      'Corect! Din −2 ≤ (x + 1)/3 < 1 rezultă −7 ≤ x < 2.',
      'Ai scris √(x + 1) = 3, deci (2x − 1)/(x + 3), ∛8, (x + 1)²/4, 2√3/3, √(3/4), f(x)/2, și/sau.',
      '((a)/(b)) și (/) și √() și )(',
    ];
    for (const text of texts) expect(plain(parseMath(text))).toBe(text);
  });
});
