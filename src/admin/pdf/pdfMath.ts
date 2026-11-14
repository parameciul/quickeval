import type { Content } from 'pdfmake/interfaces';
import { parseMath, type MathNode } from '../../ui/mathText.ts';

// The grading writes a negation as a letter with a combining bar (p̄), a
// subscript that Unicode lacks with "_" (A_p, A_(p∧q)), and some powers with
// small raised letters (σᵏ). The font of the PDFs has none of these marks and
// drops them without a sign, so p̄ would print as p. `pdfRuns` gives pdfmake
// inline runs instead: the letter with a line over it, a subscript run and a
// raised run. Roots and fractions stay as their text. It runs after
// `pdfText`, on text whose other symbols are already words.

interface Run {
  text: string;
  overline?: boolean;
  sub?: boolean;
  sup?: boolean;
}

// The small raised letters the font lacks (it has ⁿ), with their letter.
const RAISED: Record<string, string> = {
  ᵃ: 'a', ᵇ: 'b', ᶜ: 'c', ᵈ: 'd', ᵉ: 'e', ᶠ: 'f', ᵍ: 'g', ʰ: 'h', ⁱ: 'i', ʲ: 'j', ᵏ: 'k', ˡ: 'l', ᵐ: 'm',
  ᵒ: 'o', ᵖ: 'p', ʳ: 'r', ˢ: 's', ᵗ: 't', ᵘ: 'u', ᵛ: 'v', ʷ: 'w', ˣ: 'x', ʸ: 'y', ᶻ: 'z',
};
// A letter with its bar, a bar left alone (dropped: the font has no glyph for
// it), or a small raised letter.
const MARKS = new RegExp(`(\\p{L})[\\u0304\\u0305]|[\\u0304\\u0305]|[${Object.keys(RAISED).join('')}]`, 'gu');

export function pdfRuns(text: string): Content {
  const runs = merge(runsOf(parseMath(text), false));
  if (runs.every((run) => !run.overline && !run.sub && !run.sup)) return runs.map((run) => run.text).join('');
  return runs.map(({ text: piece, overline, sub, sup }) =>
    !overline && !sub && !sup ? piece : { text: piece, ...(overline && { decoration: 'overline' as const }), ...(sub && { sub }), ...(sup && { sup }) },
  );
}

function runsOf(nodes: MathNode[], sub: boolean): Run[] {
  return nodes.flatMap((node): Run[] => {
    if (typeof node === 'string') return textRuns(node, sub);
    if (node.kind === 'bar') return [{ text: node.letter, overline: true, sub }];
    if (node.kind === 'sub') return runsOf(node.part.body, true);
    if (node.kind === 'root') {
      const { open, body, close } = node.radicand;
      return [...textRuns(node.sign + open, sub), ...runsOf(body, sub), ...textRuns(close, sub)];
    }
    const { numerator: top, denominator: bottom } = node;
    return [
      ...textRuns(top.open, sub),
      ...runsOf(top.body, sub),
      ...textRuns(`${top.close}/${bottom.open}`, sub),
      ...runsOf(bottom.body, sub),
      ...textRuns(bottom.close, sub),
    ];
  });
}

function textRuns(text: string, sub: boolean): Run[] {
  const runs: Run[] = [];
  let at = 0;
  for (const match of text.matchAll(MARKS)) {
    runs.push({ text: text.slice(at, match.index), sub });
    const letter = match[1];
    if (letter !== undefined) runs.push({ text: letter, overline: true, sub });
    else if (match[0] in RAISED) runs.push({ text: RAISED[match[0]]!, sup: true });
    at = match.index + match[0].length;
  }
  runs.push({ text: text.slice(at), sub });
  return runs;
}

// Neighbouring runs of the same look become one run; empty runs go. Barred
// letters stay apart: p̄q̄ is two bars, not one bar over pq.
function merge(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const run of runs) {
    if (run.text === '') continue;
    const last = out.at(-1);
    if (last && !last.overline && !run.overline && !!last.sub === !!run.sub && !!last.sup === !!run.sup) last.text += run.text;
    else out.push({ ...run });
  }
  return out;
}
