import type { UploadStatus } from '../../shared/api.ts';
import { sha256Hex } from '../secrets.ts';
import type { TestApi, TestResponse } from './testApi.ts';

// Shortcuts for API tests: classes, students, and tests through the teacher
// API; uploads straight in the database.

export async function makeClass(
  api: TestApi,
  name: string,
  students: string[] = [],
  schoolYear = 2026,
): Promise<{ id: number; studentIds: number[] }> {
  const created = await api.request('POST', '/api/admin/classes', { name, schoolYear });
  if (created.status !== 201) throw new Error(`makeClass ${name}: ${JSON.stringify(created.body)}`);
  const id = created.body.class.id as number;
  if (students.length === 0) return { id, studentIds: [] };
  const added = await api.request('POST', `/api/admin/classes/${id}/students`, { names: students });
  return { id, studentIds: added.body.students.map((s: { id: number }) => s.id) };
}

export async function makeTest(api: TestApi, classId: number, title = 'Test de evaluare'): Promise<string> {
  const res = await api.request('POST', '/api/admin/tests', { classId, title });
  if (res.status !== 201) throw new Error(`makeTest: ${JSON.stringify(res.body)}`);
  return res.body.code as string;
}

export async function testIdOf(api: TestApi, code: string): Promise<number> {
  const row = await api.db.prepare('SELECT id FROM tests WHERE code = ?').bind(code).first<{ id: number }>();
  return row!.id;
}

// An upload row with `files` file rows (keys only; nothing is stored in R2).
export async function addSubmission(
  api: TestApi,
  code: string,
  studentId: number,
  options: { status?: Exclude<UploadStatus, 'none'>; files?: number; startedAt?: string } = {},
): Promise<number> {
  const testId = await testIdOf(api, code);
  const status = options.status ?? 'uploading';
  const row = await api.db
    .prepare('INSERT INTO submissions (test_id, student_id, status, started_at, submitted_at) VALUES (?, ?, ?, ?, ?) RETURNING id')
    .bind(testId, studentId, status, options.startedAt ?? '2026-10-06T08:00:00.000Z', status === 'uploading' ? null : '2026-10-06T08:30:00.000Z')
    .first<{ id: number }>();
  const submissionId = row!.id;
  for (let position = 1; position <= (options.files ?? 0); position++) {
    await api.db
      .prepare(
        `INSERT INTO submission_files (submission_id, r2_key, original_name, content_type, size, position, created_at)
         VALUES (?, ?, ?, 'image/jpeg', 100, ?, '2026-10-06T08:10:00.000Z')`,
      )
      .bind(submissionId, `fixture/${submissionId}/${position}.jpg`, `poza${position}.jpg`, position)
      .run();
  }
  return submissionId;
}

// A grading of an upload, straight in the database: one item per entry of
// `items`, flagged when `needsReview`, checked by the teacher when `reviewed`.
export async function addEvaluation(
  api: TestApi,
  submissionId: number,
  options: { grade?: number; items?: { needsReview?: boolean; reviewed?: boolean }[]; unreadable?: string[] } = {},
): Promise<number> {
  const items = options.items ?? [{}];
  const unreadable = options.unreadable ?? [];
  const needsReview = unreadable.length > 0 || items.some((item) => item.needsReview);
  const row = await api.db
    .prepare(
      `INSERT INTO evaluations (submission_id, max_total, office_points, total, grade, needs_review, summary,
         strengths_json, recommendations_json, unreadable_json, raw_json, created_at, updated_at)
       VALUES (?, 10, 1, ?, ?, ?, 'Rezumat.', '[]', '[]', ?, '{}', '2026-10-07T09:00:00.000Z', '2026-10-07T09:00:00.000Z')
       RETURNING id`,
    )
    .bind(submissionId, options.grade ?? 9, options.grade ?? 9, needsReview ? 1 : 0, JSON.stringify(unreadable))
    .first<{ id: number }>();
  for (const [index, item] of items.entries()) {
    await api.db
      .prepare(
        `INSERT INTO evaluation_items (evaluation_id, exercise_id, position, label, max_points, ai_points, points,
           student_answer, comment, confidence, needs_review, review_reason, reviewed_at)
         VALUES (?, ?, ?, 'Exercițiu', 1, 1, 1, 'r', 'c', 'high', ?, ?, ?)`,
      )
      .bind(
        row!.id,
        `E${index + 1}`,
        index + 1,
        item.needsReview ? 1 : 0,
        item.needsReview ? 'Verifică' : '',
        item.reviewed ? '2026-10-07T10:00:00.000Z' : null,
      )
      .run();
  }
  return row!.id;
}

// Marks the test file and the barem as uploaded (rows only; nothing in R2).
export async function addTestFiles(api: TestApi, code: string, kinds: ('test' | 'barem')[] = ['test', 'barem']): Promise<void> {
  for (const kind of kinds) {
    await api.db
      .prepare(`UPDATE tests SET ${kind}_file_key = ?, ${kind}_file_name = ?, ${kind}_file_type = 'application/pdf' WHERE code = ?`)
      .bind(`fixture/${code}/${kind}.pdf`, `${kind}.pdf`, code)
      .run();
  }
}

// Start test through the teacher API; returns the upload token of the link.
export async function startTest(api: TestApi, code: string): Promise<string> {
  const res = await api.request('POST', `/api/admin/tests/${code}/start`);
  if (res.status !== 200) throw new Error(`startTest: ${JSON.stringify(res.body)}`);
  return res.body.uploadToken as string;
}

// A test, class, and student that belong to another teacher.
export async function otherTeacherTest(api: TestApi, email = 'alt.profesor@example.com'): Promise<{ code: string; studentId: number }> {
  const teacherId = await api.addTeacher(email, 'Alt Profesor');
  const cls = await api.db
    .prepare("INSERT INTO classes (teacher_id, name, school_year, created_at) VALUES (?, '9Z', 2026, '2026-10-06') RETURNING id")
    .bind(teacherId)
    .first<{ id: number }>();
  const student = await api.db
    .prepare("INSERT INTO students (teacher_id, full_name, created_at) VALUES (?, 'Elev Străin', '2026-10-06') RETURNING id")
    .bind(teacherId)
    .first<{ id: number }>();
  await api.db.prepare('INSERT INTO enrollments (class_id, student_id) VALUES (?, ?)').bind(cls!.id, student!.id).run();
  await api.db
    .prepare(
      `INSERT INTO tests (teacher_id, class_id, number, code, title, status, upload_token, created_at, updated_at)
       VALUES (?, ?, 1, '9Z-26T1', 'Test străin', 'open', 'zzzzzzzzzzzzzzzz', '2026-10-06', '2026-10-06')`,
    )
    .bind(teacherId, cls!.id)
    .run();
  return { code: '9Z-26T1', studentId: student!.id };
}

export const ROBOT_KEY = 'test-robot-key-0123456789abcdef';

// Stores the hash of a robot key straight in the database; returns the key.
export async function setRobotKey(api: TestApi, key = ROBOT_KEY): Promise<string> {
  await api.db
    .prepare("INSERT INTO settings (key, value) VALUES ('runner_key_hash', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
    .bind(await sha256Hex(key))
    .run();
  return key;
}

// A request to the robot API with a robot key.
export function robotRequest(api: TestApi, key = ROBOT_KEY) {
  return (method: string, path: string, body?: unknown): Promise<TestResponse> =>
    api.request(method, `/api/runner${path}`, body, { Authorization: `Bearer ${key}` });
}
