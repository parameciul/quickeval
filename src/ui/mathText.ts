// The grading writes math as plain Unicode text (√15, (x + 1)/3, 2x/5),
// because the PDFs and the CSV need text. The pages draw it like on paper: a
// root gets its bar over the whole radicand, and a fraction stands with its
// numerator over its denominator. `parseMath` finds those two shapes and
// leaves everything else as text.
//
// The drawing drops nothing from the text: the brackets that the bar or the
// fraction line makes needless, and the "/" itself, stay in the nodes, so the
// page keeps the same text for copying and for screen readers.

export type MathNode = string | MathRoot | MathFraction;

// A radicand, a numerator or a denominator. `open` and `close` are the
// brackets of the text that the drawing replaces: "(" and ")" of √(x + 1) or
// (x + 1)/3, or "" when there were none.
export interface MathPart {
  open: string;
  body: MathNode[];
  close: string;
}

export interface MathRoot {
  kind: 'root';
  sign: string;
  // "" for a square root, "3" for ∛ and "4" for ∜.
  index: string;
  radicand: MathPart;
}

export interface MathFraction {
  kind: 'fraction';
  numerator: MathPart;
  denominator: MathPart;
}

const ROOT_INDEX: Record<string, string> = { '√': '', '∛': '3', '∜': '4' };
// Sticky patterns, read at a position. None of them takes a ")", so none
// runs past the end of a bracket group.
const SCRIPTS = /[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿ₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎]*/uy;
const NUMBER = /\d+(?:[.,]\d+)?/uy;
const WORD = /[\p{L}\p{M}]+/uy;
// A bracket group longer than this, or one that holds an interval (";" or a
// square bracket), is ordinary text: never a radicand or a fraction part.
const GROUP_LIMIT = 40;

type Token =
  | { kind: 'text'; text: string; start: number; end: number }
  | { kind: 'slash' | 'sign'; text: string; start: number; end: number }
  | { kind: 'number' | 'letter'; text: string; start: number; end: number }
  | { kind: 'group'; inner: Token[]; scripts: string; fits: boolean; start: number; end: number };

// One piece of the shaped text: `nodes` is how it reads inline, and `part`
// is set when it can be a radicand or a fraction part.
interface Item {
  kind: Token['kind'] | 'root' | 'fraction';
  nodes: MathNode[];
  part: MathPart | null;
  start: number;
  end: number;
}

export function parseMath(text: string): MathNode[] {
  if (!/[√∛∜/]/u.test(text)) return [text];
  return join(shape(tokenize(text, 0, text.length, matchBrackets(text)), text).flatMap((item) => item.nodes));
}

export function hasMath(nodes: MathNode[]): boolean {
  return nodes.some((node) => typeof node !== 'string');
}

// Each "(" with its ")". Intervals such as [−4; 5) leave a ")" without its
// "(", and (5; 9] a "(" without its ")": those stay text.
function matchBrackets(text: string): Map<number, number> {
  const open: number[] = [];
  const pairs = new Map<number, number>();
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') open.push(i);
    else if (text[i] === ')' && open.length > 0) pairs.set(open.pop()!, i);
  }
  return pairs;
}

function readAt(pattern: RegExp, text: string, at: number): string {
  pattern.lastIndex = at;
  return pattern.exec(text)?.[0] ?? '';
}

function tokenize(text: string, from: number, to: number, pairs: Map<number, number>): Token[] {
  const tokens: Token[] = [];
  const add = (kind: 'text' | 'number' | 'letter' | 'slash' | 'sign', piece: string, start: number) => {
    const last = tokens.at(-1);
    if (kind === 'text' && last?.kind === 'text') {
      last.text += piece;
      last.end += piece.length;
    } else tokens.push({ kind, text: piece, start, end: start + piece.length });
    return start + piece.length;
  };
  let i = from;
  while (i < to) {
    const char = text[i]!;
    const close = pairs.get(i);
    if (char === '(' && close !== undefined && close < to) {
      const scripts = readAt(SCRIPTS, text, close + 1);
      const inside = text.slice(i + 1, close);
      const fits = inside.trim() !== '' && inside.length <= GROUP_LIMIT && !/[;[\]]/u.test(inside);
      const end = close + 1 + scripts.length;
      tokens.push({ kind: 'group', inner: tokenize(text, i + 1, close, pairs), scripts, fits, start: i, end });
      i = end;
      continue;
    }
    if (char in ROOT_INDEX) {
      i = add('sign', char, i);
      continue;
    }
    if (char === '/') {
      i = add('slash', char, i);
      continue;
    }
    const number = readAt(NUMBER, text, i);
    if (number !== '') {
      i = add('number', number + readAt(SCRIPTS, text, i + number.length), i);
      continue;
    }
    // One letter is a variable (x, a, π); a longer run is a word.
    const word = readAt(WORD, text, i);
    if (word.length === 1) i = add('letter', word + readAt(SCRIPTS, text, i + 1), i);
    else i = add('text', word || char, i);
  }
  return tokens;
}

// Roots first (√ binds to what touches it on the right), then fractions.
function shape(tokens: Token[], text: string): Item[] {
  const items: Item[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const following = tokens[i + 1];
    if (token.kind === 'sign' && following && following.start === token.end) {
      const radicand = item(following, text);
      if (radicand.part) {
        const root: MathRoot = { kind: 'root', sign: token.text, index: ROOT_INDEX[token.text]!, radicand: radicand.part };
        items.push({ kind: 'root', nodes: [root], part: { open: '', body: [root], close: '' }, start: token.start, end: radicand.end });
      } else items.push(item(token, text), radicand);
      i += 1;
    } else items.push(item(token, text));
  }
  return fractions(items, text);
}

function item(token: Token, text: string): Item {
  const { start, end } = token;
  if (token.kind === 'group') {
    const body = join(shape(token.inner, text).flatMap((inner) => inner.nodes));
    const nodes = join(['(', ...body, `)${token.scripts}`]);
    // A power of the group keeps its brackets: (x + 1)²/3.
    const part = !token.fits ? null : token.scripts === '' ? { open: '(', body, close: ')' } : { open: '', body: nodes, close: '' };
    return { kind: 'group', nodes, part, start, end };
  }
  const part = token.kind === 'number' || token.kind === 'letter' ? { open: '', body: [token.text], close: '' } : null;
  return { kind: token.kind, nodes: [token.text], part, start, end };
}

// a/b where both sides are a number, a letter, a root or a bracket group. The
// numerator takes the pieces that touch it on the left (2x, 3√2, f(x)); the
// denominator is one piece. Chains (1/2/3, dates) and slashes between words
// or inside them (și/sau, km/h, I.1/I.2, 1/2x) stay text.
function fractions(items: Item[], text: string): Item[] {
  const out: Item[] = [];
  for (let i = 0; i < items.length; i++) {
    const slash = items[i]!;
    const below = items[i + 1];
    if (slash.kind !== 'slash' || !below?.part || below.start !== slash.end || items[i + 2]?.kind === 'slash') {
      out.push(slash);
      continue;
    }
    let first = out.length;
    while (first > 0 && out[first - 1]!.part && out[first - 1]!.end === (out[first]?.start ?? slash.start)) first -= 1;
    const above = out.slice(first);
    const start = above[0]?.start ?? slash.start;
    const before = text[start - 1] ?? ' ';
    const after = text.slice(below.end, below.end + 2);
    if (above.length === 0 || out[first - 1]?.kind === 'slash' || /[\p{L}\p{N}._]/u.test(before) || /^(?:[\p{L}\p{N}_]|[.,][\p{L}\p{N}])/u.test(after)) {
      out.push(slash);
      continue;
    }
    const numerator = above.length === 1 ? above[0]!.part! : { open: '', body: join(above.flatMap((piece) => piece.nodes)), close: '' };
    const fraction: MathFraction = { kind: 'fraction', numerator, denominator: below.part };
    out.splice(first, above.length, { kind: 'fraction', nodes: [fraction], part: null, start, end: below.end });
    i += 1;
  }
  return out;
}

// Neighbouring strings become one string.
function join(nodes: MathNode[]): MathNode[] {
  const out: MathNode[] = [];
  for (const node of nodes) {
    const last = out.at(-1);
    if (typeof node === 'string' && typeof last === 'string') out[out.length - 1] = last + node;
    else if (node !== '') out.push(node);
  }
  return out;
}
