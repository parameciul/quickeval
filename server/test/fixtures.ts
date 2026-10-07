import type { UploadStatus } from '../../shared/api.ts';
import type { TestApi } from './testApi.ts';

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
