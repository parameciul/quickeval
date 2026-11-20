// Finds the text people read that is not translated: the guard that keeps the
// English version complete. It parses a source file and reports every piece of
// visible text that is not an argument of t(), tc() or k() (src/i18n/t.ts):
// JSX text with a letter, a text attribute (aria-label, title, placeholder, alt,
// label), and any other string that has Romanian letters or reads as a sentence.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parseSync } from 'rolldown/utils';

export interface Finding {
  file: string;
  line: number;
  text: string;
}

// The calls whose string arguments are dictionary keys.
const KEY_CALLS = new Set(['t', 'tc', 'k', 'tl']);
// Calls whose strings are for developers, never shown.
const DEV_CALLS = new Set(['Error', 'TypeError', 'RangeError', 'warn', 'log', 'error', 'info', 'debug', 'querySelector', 'querySelectorAll', 'closest', 'matches', 'getElementById', 'setAttribute', 'getAttribute', 'removeAttribute', 'hasAttribute', 'toggleAttribute', 'addEventListener', 'removeEventListener', 'createElement', 'createElementNS', 'matchMedia', 'startsWith', 'endsWith', 'includes', 'replace', 'split', 'test', 'getItem', 'setItem', 'removeItem', 'useMediaQuery', 'fetch', 'request', 'get', 'post', 'put', 'patch', 'del', 'json']);
const TEXT_ATTRIBUTES = new Set(['aria-label', 'title', 'placeholder', 'alt', 'label', 'aria-description', 'aria-roledescription', 'aria-valuetext']);

const ROMANIAN = /[ăâîșțşţĂÂÎȘȚŞŢ„”…]/;
const SENTENCE = /^[A-ZĂÂÎȘȚ][a-zăâîșț]+(?:[ ,][a-zăâîșț0-9,.:;!?()’'-]+)+[.?!:…]?$/;
const LETTER = /\p{L}/u;
const STOPWORDS = /(?<!\p{L})(din|de|la|pe|cu|și|sau|nu|au|ale|este|sunt|pentru|cele|toate|unul|gata|clic|lucr\p{L}+|elev\p{L}*|punct\p{L}*|trimis\p{L}*|publicat\p{L}*|verificat\p{L}*|bifat\p{L}*|Acum|Decide|Ai)(?!\p{L})/u;
// The six stages' names are identifiers in the code (StageName); a page shows
// them through t().
const IDENTIFIERS = new Set(['Pregătire', 'Tipărire', 'În clasă', 'Corectare', 'Verificare', 'Rezultate']);

// Text that is the same in both languages.
const SAME = new Set(['MQGrader', 'by Laura Miron', 'Laura Miron', 'RO', 'EN', 'CES', 'PDF', 'CSV', 'QR', 'OK', 'Email', 'Stripe', 'GitHub', 'Claude', 'Turnstile', 'Rybbit', 'mqgrader.ro', 'MQ', 'ID', 'x', 'p', 'pt', 'Matematică cu Laura Miron']);

function isShown(text: string): boolean {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!LETTER.test(trimmed)) return false;
  if (SAME.has(trimmed)) return false;
  return true;
}

function looksLikeText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === '' || SAME.has(trimmed) || IDENTIFIERS.has(trimmed)) return false;
  if (/^[\w.-]+@[\w.-]+$/.test(trimmed) || /^(https?:|mailto:|\/|\.\/|\.\.\/|#)/.test(trimmed)) return false;
  return ROMANIAN.test(trimmed) || SENTENCE.test(trimmed) || (trimmed.includes(' ') && STOPWORDS.test(trimmed));
}

type Node = { type: string; start: number; end: number; [key: string]: unknown };

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && typeof (value as Node).type === 'string';
}

function calleeName(node: Node): string | null {
  const callee = node.callee as Node | undefined;
  if (!callee) return null;
  if (callee.type === 'Identifier') return callee.name as string;
  if (callee.type === 'MemberExpression') {
    const property = callee.property as Node;
    return property.type === 'Identifier' ? (property.name as string) : null;
  }
  return null;
}

export function scanSource(file: string, source: string): Finding[] {
  const lang = file.endsWith('.tsx') ? 'tsx' : 'ts';
  const { program } = parseSync(`x.${lang}`, source, { lang });
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') lineStarts.push(i + 1);
  const lineOf = (offset: number) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((lineStarts[mid] ?? 0) <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  // Lines marked `i18n-ignore` (data the robot or the teacher wrote, sample
  // data, a stored value) are skipped, and so is the line after such a comment.
  const ignored = new Set<number>();
  source.split('\n').forEach((text, i) => {
    if (text.includes('i18n-ignore')) {
      ignored.add(i + 1);
      if (/^\s*(\/\/|\{\/\*|\/\*)/.test(text)) ignored.add(i + 2);
    }
  });

  const findings: Finding[] = [];
  const report = (node: Node, text: string) => {
    const line = lineOf(node.start);
    if (!ignored.has(line)) findings.push({ file, line, text: text.replace(/\s+/g, ' ').trim() });
  };

  const walk = (node: Node, parents: Node[]) => {
    const parent = parents[parents.length - 1];
    switch (node.type) {
      case 'ImportDeclaration':
      case 'ExportAllDeclaration':
      case 'TSImportType':
      case 'TSLiteralType':
      case 'TSEnumMember':
        return;
      case 'ExportNamedDeclaration':
        if (node.source) return;
        break;
      case 'CallExpression':
      case 'NewExpression': {
        const name = calleeName(node);
        if (name && (KEY_CALLS.has(name) || DEV_CALLS.has(name))) {
          // Keys need no check; nested calls in the parameters still do.
          for (const arg of (node.arguments as Node[]) ?? []) {
            if (arg.type === 'ObjectExpression') walk(arg, [...parents, node]);
          }
          return;
        }
        break;
      }
      case 'JSXText':
        if (isShown(node.value as string)) report(node, node.value as string);
        return;
      case 'JSXAttribute': {
        const nameNode = node.name as Node;
        const attr = nameNode.type === 'JSXIdentifier' ? (nameNode.name as string) : '';
        const value = node.value as Node | null;
        if (attr === 'className' || attr === 'd' || attr === 'viewBox' || attr === 'href' || attr === 'to' || attr === 'id') return;
        if (value && value.type === 'Literal' && typeof value.value === 'string') {
          if ((TEXT_ATTRIBUTES.has(attr) && isShown(value.value)) || looksLikeText(value.value)) report(value, value.value);
          return;
        }
        break;
      }
      case 'Literal':
        if (typeof node.value === 'string') {
          // An object's key is not text.
          if (parent && parent.type === 'Property' && parent.key === node && !parent.computed) return;
          if (parent && parent.type === 'BinaryExpression' && ['===', '!==', '==', '!='].includes(parent.operator as string)) return;
          if (looksLikeText(node.value)) report(node, node.value);
        }
        return;
      case 'TemplateLiteral': {
        const raw = ((node.quasis as Node[]) ?? []).map((q) => ((q.value as { cooked: string | null }).cooked ?? '')).join('{}');
        if (looksLikeText(raw) || (ROMANIAN.test(raw) && LETTER.test(raw))) report(node, raw);
        for (const expression of (node.expressions as Node[]) ?? []) walk(expression, [...parents, node]);
        return;
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue;
      const value = node[key];
      if (Array.isArray(value)) {
        for (const item of value) if (isNode(item)) walk(item, [...parents, node]);
      } else if (isNode(value)) {
        walk(value, [...parents, node]);
      }
    }
  };
  walk(program as unknown as Node, []);
  return findings;
}

// Every source file under these folders, tests and the dictionaries left out.
export function sourceFiles(root: string, dirs: string[]): string[] {
  const out: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'test' || entry.name === 'en') continue;
        visit(path);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        out.push(path);
      }
    }
  };
  for (const dir of dirs) visit(join(root, dir));
  return out.map((path) => relative(root, path).split(sep).join('/')).sort();
}

export function scanFiles(root: string, files: string[]): Finding[] {
  return files.flatMap((file) => scanSource(file, readFileSync(join(root, file), 'utf8')));
}
