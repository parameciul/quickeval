import type { BaremRequest, CesPrepared, TestSummary } from '../../shared/api.ts';

// What a draft or open test still misses (spec: CES switch and missing
// warnings), in this order: the test file, the barem, and, while the class has
// a CES student and the CES switch is on, the CES test file and the CES barem.
// A barem that is being generated is not missing.
export type MissingPart = 'test' | 'barem' | 'cesTest' | 'cesBarem';

const NAMES: Record<MissingPart, string> = {
  test: 'testul',
  barem: 'baremul',
  cesTest: 'testul CES',
  cesBarem: 'baremul CES',
};

// What a test has, or what Test nou will give it.
export interface PreparedParts {
  testFile: boolean;
  baremFile: boolean;
  baremRequest: BaremRequest;
  ces: CesPrepared;
}

export function missingParts(parts: PreparedParts): MissingPart[] {
  const missing: MissingPart[] = [];
  if (!parts.testFile) missing.push('test');
  if (!parts.baremFile && parts.baremRequest !== 'requested') missing.push('barem');
  if (parts.ces.wanted) {
    if (!parts.ces.testFile) missing.push('cesTest');
    if (!parts.ces.baremFile && parts.ces.baremRequest !== 'requested') missing.push('cesBarem');
  }
  return missing;
}

// What a test of the tests list misses: nothing once it is in evaluation or done.
export function missingOf(test: TestSummary): MissingPart[] {
  if (test.status !== 'draft' && test.status !== 'open') return [];
  const { testFile, baremFile, ces } = test.prepared;
  return missingParts({ testFile, baremFile, baremRequest: test.barem.request, ces });
}

// "testul", "testul și baremul", "testul, baremul și testul CES".
export function missingNames(missing: MissingPart[]): string {
  const names = missing.map((part) => NAMES[part]);
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} și ${names[names.length - 1]}`;
}

// "lipsește testul CES", "lipsesc testul CES și baremul CES".
export function missingNote(missing: MissingPart[]): string {
  return `${missing.length === 1 ? 'lipsește' : 'lipsesc'} ${missingNames(missing)}`;
}

export function missingName(part: MissingPart): string {
  return NAMES[part];
}
