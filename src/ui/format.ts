import type { RobotStart, UploadStatus } from '../../shared/api.ts';
import type { Confidence } from '../../shared/schemas.ts';
import type { TestStatus } from '../../shared/tests.ts';

// Romanian counts: "1 lucrare", "2 lucrări", "20 de lucrări" (20 or more,
// and round hundreds, take "de").
export function countLabel(count: number, one: string, many: string): string {
  if (count === 1) return `1 ${one}`;
  const lastTwo = count % 100;
  return count > 0 && (lastTwo >= 20 || lastTwo === 0) ? `${count} de ${many}` : `${count} ${many}`;
}

export function studentCountLabel(count: number): string {
  return count === 0 ? 'niciun elev' : countLabel(count, 'elev', 'elevi');
}

const TEST_STATUS: Record<TestStatus, string> = {
  draft: 'Ciornă',
  open: 'Deschis',
  evaluating: 'Se corectează',
  done: 'Corectat',
};

export function testStatusLabel(status: TestStatus): string {
  return TEST_STATUS[status];
}

const UPLOAD_STATUS: Record<UploadStatus, string> = {
  none: 'Nu a trimis',
  uploading: 'Încarcă…',
  submitted: 'Trimis',
  grading: 'Se corectează',
  graded: 'Corectat',
  failed: 'Eroare',
};

export function uploadStatusLabel(status: UploadStatus): string {
  return UPLOAD_STATUS[status];
}

const DATE_TIME = new Intl.DateTimeFormat('ro-RO', {
  timeZone: 'Europe/Bucharest',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

// Every time on screen is Romania's local time: "6 oct. 2026, 10:15".
export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

const ONE_DECIMAL = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 });

// "820 KB", "1,3 MB".
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${ONE_DECIMAL.format(bytes / (1024 * 1024))} MB`;
}

const ROBOT_START: Record<RobotStart, string> = {
  dispatched: 'Robotul pornește în aproximativ un minut.',
  next_check: 'Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.',
};

// What the teacher reads after she starts grading.
export function robotStartMessage(robot: RobotStart): string {
  return ROBOT_START[robot];
}

const CONFIDENCE: Record<Confidence, string> = { high: 'Mare', medium: 'Medie', low: 'Mică' };

// How sure the robot is of an item's points.
export function confidenceLabel(confidence: Confidence): string {
  return CONFIDENCE[confidence];
}

// The robot names the pages of an upload "student/page-02.jpg", in upload
// order, as the result page numbers them: "Pagina 2".
export function pageLabel(name: string): string {
  const match = /page-(\d+)\.[a-z]+$/.exec(name);
  return match ? `Pagina ${Number(match[1])}` : name;
}

// Points as the teacher types them: "2,5" or "2.5". Null for anything else.
export function parsePoints(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(text) ? Number(text) : null;
}
