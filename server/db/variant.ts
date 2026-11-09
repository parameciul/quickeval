import type { TestVariant } from '../../shared/files.ts';

// The CES variant of a test (migration 0024) has its own copy of every column
// that the test file, the barem, the exercise list and the print PDF use: the
// same name with "ces_" in front. The queries that work on either variant
// name their columns through columns(variant).
export type VariantColumn =
  | 'test_file_key'
  | 'test_file_name'
  | 'test_file_type'
  | 'barem_file_key'
  | 'barem_file_name'
  | 'barem_file_type'
  | 'barem_notes'
  | 'barem_request'
  | 'barem_request_attempts'
  | 'barem_unchecked'
  | 'exercise_list_json'
  | 'exercise_list_status'
  | 'exercise_list_message'
  | 'exercise_list_attempts'
  | 'print_status'
  | 'print_file_key'
  | 'print_attempts'
  | 'files_version';

export function columns(variant: TestVariant): (column: VariantColumn) => string {
  return (column) => (variant === 'ces' ? `ces_${column}` : column);
}

// The test statuses in which the robot may generate a barem. A class barem
// only before the evaluation (an unchecked barem must not change one that is
// grading); a CES barem also during it: the CES papers wait for it, and the
// class papers are graded meanwhile.
export function baremStatuses(variant: TestVariant): string {
  return variant === 'ces' ? "'draft', 'open', 'evaluating'" : "'draft', 'open'";
}

// The CES files, comments and barem stay as they are while the robot grades a
// CES paper with them: a condition on the `tests` row being written, empty for
// the class variant (its files have their own rule, in the routes).
export function noCesGradingSql(variant: TestVariant): string {
  return variant === 'ces'
    ? "AND NOT EXISTS (SELECT 1 FROM submissions cg WHERE cg.test_id = tests.id AND cg.status = 'grading' AND cg.variant = 'ces')"
    : '';
}

// A draft or open test (alias `t`) with an upload link and a test file of the
// variant whose print PDF is not made yet. A flat condition: the print writes
// pass the table name for `t`.
export function needsPrintSql(variant: TestVariant, t = 't'): string {
  const c = columns(variant);
  return `${t}.status IN ('draft', 'open') AND ${t}.upload_token IS NOT NULL AND ${t}.${c('test_file_key')} IS NOT NULL AND ${t}.${c('print_status')} = 'none'`;
}

// A test (alias `t`) with a test file of the variant whose barem the teacher
// asked the robot to generate. A flat condition, like needsPrintSql.
export function needsBaremSql(variant: TestVariant, t = 't'): string {
  const c = columns(variant);
  return `${t}.status IN (${baremStatuses(variant)}) AND ${t}.${c('test_file_key')} IS NOT NULL AND ${t}.${c('barem_request')} = 'requested'`;
}

// The barem of the variant can be graded against: it exists, the teacher
// checked it when the robot generated it, and no generation is running.
export function baremActiveSql(variant: TestVariant, t = 't'): string {
  const c = columns(variant);
  return `${t}.${c('barem_file_key')} IS NOT NULL AND ${t}.${c('barem_unchecked')} = 0 AND ${t}.${c('barem_request')} <> 'requested'`;
}

// The variant a paper (alias `s`) of test `t` is graded with: the one written
// on it when it first went to grading; before that, CES when the student is
// marked CES and the test has a CES test file, the class test otherwise.
export function paperVariantSql(s = 's', t = 't'): string {
  return `COALESCE(${s}.variant, CASE WHEN ${t}.ces_test_file_key IS NOT NULL
    AND EXISTS (SELECT 1 FROM students pv WHERE pv.id = ${s}.student_id AND pv.ces = 1) THEN 'ces' ELSE 'class' END)`;
}
