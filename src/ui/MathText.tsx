import type { ReactNode } from 'react';
import { hasMath, parseMath, type MathNode, type MathPart } from './mathText.ts';

// A text of the grading (a comment, an answer, a summary) with its roots and
// fractions drawn like on paper (`mathText.ts`). The page text stays the
// same: the "/", the "√" and the brackets that the drawing replaces are kept
// in `sr-only` spans, for copying and for screen readers.
export function MathText({ text }: { text: string }): ReactNode {
  const nodes = parseMath(text);
  if (!hasMath(nodes)) return text;
  return glue(nodes);
}

// A line never breaks between a drawn root or fraction and the characters
// that touch it, as the ")" in (3; √15).
function glue(nodes: MathNode[]): ReactNode[] {
  const out: ReactNode[] = [];
  let word: ReactNode[] = [];
  let drawn = false;
  const flush = () => {
    if (drawn) out.push(<span key={out.length} className="math-word">{word}</span>);
    else out.push(...word);
    word = [];
    drawn = false;
  };
  for (const node of nodes) {
    if (typeof node !== 'string') {
      word.push(draw(node, word.length));
      drawn = true;
      continue;
    }
    for (const piece of node.split(/(\s+)/u)) {
      if (piece === '') continue;
      if (/^\s+$/u.test(piece)) {
        flush();
        out.push(piece);
      } else word.push(piece);
    }
  }
  flush();
  return out;
}

function draw(node: MathNode, key: number): ReactNode {
  if (typeof node === 'string') return node;
  if (node.kind === 'root') {
    return (
      <span key={key} className="math-root" data-index={node.index || undefined}>
        <span className="sr-only">{node.sign + node.radicand.open}</span>
        <svg className="math-root-sign" viewBox="0 0 10 20" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d="M0.5 11.5L2.8 10.2L5.3 20L9.6 0H10" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="math-radicand">{drawAll(node.radicand.body)}</span>
        {node.radicand.close !== '' && <span className="sr-only">{node.radicand.close}</span>}
      </span>
    );
  }
  return (
    <span key={key} className="math-fraction">
      <span className="math-numerator">{drawPart(node.numerator)}</span>
      <span className="sr-only">/</span>
      <span className="math-denominator">{drawPart(node.denominator)}</span>
    </span>
  );
}

function drawPart(part: MathPart): ReactNode {
  return (
    <>
      {part.open !== '' && <span className="sr-only">{part.open}</span>}
      {drawAll(part.body)}
      {part.close !== '' && <span className="sr-only">{part.close}</span>}
    </>
  );
}

function drawAll(nodes: MathNode[]): ReactNode[] {
  return nodes.map(draw);
}
