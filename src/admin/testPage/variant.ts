import type { TestInfo } from '../../../shared/api.ts';
import type { TestVariant } from '../../../shared/files.ts';

// What each variant of a test has of its own, as the test page shows it: the
// class test's parts are on the test, the CES variant's in `test.ces`.
export type VariantParts = Pick<TestInfo, 'files' | 'barem' | 'baremNotes' | 'filesVersion' | 'exerciseList' | 'print'>;

export function partsOf(test: TestInfo, variant: TestVariant): VariantParts {
  return variant === 'ces' ? test.ces : test;
}

// The test page shows "Varianta CES" when a student of the class is marked CES,
// or when the variant already has a file (so the teacher can see and remove it).
export function showsCes(test: TestInfo): boolean {
  return test.ces.studentCount > 0 || test.ces.files.test !== null || test.ces.files.barem !== null;
}

// The CES barem can be graded against: it exists, it is checked, and no new
// one is being generated.
export function cesBaremActive(test: TestInfo): boolean {
  const { files, barem } = test.ces;
  return files.barem !== null && !barem.unchecked && barem.request !== 'requested';
}
