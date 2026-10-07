import type { TestStatus } from '../../shared/tests.ts';
import { testStatusLabel } from '../ui/format.ts';

export function StatusChip({ status }: { status: TestStatus }) {
  return <span className={`status status-${status}`}>{testStatusLabel(status)}</span>;
}
