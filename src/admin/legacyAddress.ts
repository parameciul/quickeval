// The teacher app's addresses were Romanian until 2026-11-17 (spec: every
// address is English, docs/superpowers/plans/2026-11-17-english-addresses.md).
// Old addresses live on in sent emails, bookmarks and open tabs, so the app
// turns them into the English ones before any page reads them. The maps are
// exact: the hash also carries the email tokens, and a pattern could change one.

// The first part of a path, and the parts under /tests/<code>/.
const FIRST: Record<string, string> = {
  teste: 'tests',
  clase: 'classes',
  elevi: 'students',
  cautare: 'search',
  setari: 'settings',
  cont: 'account',
  'confirma-email': 'confirm-email',
  'parola-noua': 'new-password',
};
const UNDER_TEST: Record<string, string> = { elevi: 'papers', raport: 'report', verificare: 'review' };

// Query parameters, and the values each one takes.
const KEYS: Record<string, string> = {
  lucrare: 'paper',
  punct: 'item',
  clasa: 'class',
  arhivate: 'archived',
  vedere: 'view',
  arata: 'show',
  plata: 'payment',
};
const VALUES: Record<string, Record<string, string>> = {
  item: { pagini: 'pages' },
  view: { toate: 'all', verificare: 'review' },
  show: { elevi: 'students', clase: 'classes', teste: 'tests' },
  tab: { conturi: 'accounts', corectarea: 'grading', robotul: 'robot' },
  payment: { reusita: 'success', anulata: 'cancelled' },
};

const HASHES: Record<string, string> = {
  '#pregatire': '#prepare',
  '#tiparire': '#print',
  '#in-clasa': '#in-class',
  '#corectare': '#grading',
  '#verificare': '#review',
  '#rezultate': '#results',
  '#pe-scurt': '#summary',
  '#exercitii': '#exercises',
  '#analiza': '#analysis',
  '#cont-nou': '#new-account',
};

// The map's own entry for a name: never one of Object's ("toString").
function own(map: Record<string, string>, name: string | undefined): string | undefined {
  return name !== undefined && Object.hasOwn(map, name) ? map[name] : undefined;
}

// The English path of an old one; any other path comes back as it is.
export function englishPath(pathname: string): string {
  const parts = pathname.split('/');
  const first = own(FIRST, parts[1]);
  if (first === undefined) return pathname;
  if (parts[1] === 'teste') {
    if (parts[2] === 'nou' && parts.length === 3) parts[2] = 'new';
    const under = own(UNDER_TEST, parts[3]);
    if (under !== undefined) parts[3] = under;
  }
  parts[1] = first;
  return parts.join('/');
}

// The English query of an old one ("?clasa=2&arhivate=1"). Other parameters,
// such as Stripe's session_id, keep their names, values and order.
export function englishSearch(search: string): string {
  if (search === '' || search === '?') return search;
  const params = new URLSearchParams(search);
  let changed = false;
  const next = new URLSearchParams();
  for (const [rawKey, rawValue] of params) {
    const key = own(KEYS, rawKey) ?? rawKey;
    const values = Object.hasOwn(VALUES, key) ? VALUES[key] : undefined;
    const value = (values && own(values, rawValue)) ?? rawValue;
    if (key !== rawKey || value !== rawValue) changed = true;
    next.append(key, value);
  }
  return changed ? `?${next.toString()}` : search;
}

// The English hash of an old one; a token or any other hash stays as it is.
export function englishHash(hash: string): string {
  return own(HASHES, hash) ?? hash;
}

export interface Address {
  pathname: string;
  search: string;
  hash: string;
}

// The English address of an old one, or null when it is English already.
export function englishAddress(address: Address): Address | null {
  const next = { pathname: englishPath(address.pathname), search: englishSearch(address.search), hash: englishHash(address.hash) };
  return next.pathname === address.pathname && next.search === address.search && next.hash === address.hash ? null : next;
}
