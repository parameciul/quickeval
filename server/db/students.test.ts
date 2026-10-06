import type { D1Database } from '@cloudflare/workers-types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApi, type TestApi } from '../test/testApi.ts';
import { listClassStudents } from './classes.ts';
import { addStudentsToClass } from './students.ts';

let api: TestApi;
let classId: number;

beforeAll(async () => {
  api = await startTestApi();
  const row = await api.db
    .prepare("INSERT INTO classes (teacher_id, name, school_year, created_at) VALUES (?, '6E2', 2026, '2026-10-06') RETURNING id")
    .bind(api.teacherId)
    .first<{ id: number }>();
  classId = row!.id;
});

afterAll(async () => {
  await api.dispose();
});

const count = async (sql: string) => (await api.db.prepare(sql).first<{ n: number }>())!.n;

describe('addStudentsToClass', () => {
  it('adds the students and enrolls them, with ids in name order', async () => {
    const added = await addStudentsToClass(api.db, api.teacherId, classId, ['Pop Ion', 'Ionescu Ana'], '2026-10-06T08:00:00.000Z');
    expect(added.map((s) => s.fullName)).toEqual(['Pop Ion', 'Ionescu Ana']);
    expect(added[1]!.id).toBe(added[0]!.id + 1);
    expect(await count(`SELECT COUNT(*) AS n FROM enrollments WHERE class_id = ${classId}`)).toBe(2);
  });

  it('adds nothing when another request took the same ids', async () => {
    const studentsBefore = await count('SELECT COUNT(*) AS n FROM students');
    // A database whose "highest id" answer is stale, as if another request
    // inserted students between the read and the batch.
    const stale = {
      prepare: (sql: string) => api.db.prepare(sql.startsWith('SELECT COALESCE(MAX(id)') ? 'SELECT 0 AS max' : sql),
      batch: api.db.batch.bind(api.db),
    } as unknown as D1Database;
    await expect(addStudentsToClass(stale, api.teacherId, classId, ['Nou Elev'], '2026-10-06T08:00:00.000Z')).rejects.toMatchObject({
      status: 409,
      code: 'busy',
    });
    expect(await count('SELECT COUNT(*) AS n FROM students')).toBe(studentsBefore);
    expect(await count(`SELECT COUNT(*) AS n FROM enrollments WHERE class_id = ${classId}`)).toBe(2);
  });
});

describe('listClassStudents', () => {
  it('lists the students for the owning teacher and nothing for another teacher', async () => {
    const row = await api.db
      .prepare("INSERT INTO classes (teacher_id, name, school_year, created_at) VALUES (?, '7B', 2026, '2026-10-06') RETURNING id")
      .bind(api.teacherId)
      .first<{ id: number }>();
    const otherClassId = row!.id;
    await addStudentsToClass(api.db, api.teacherId, otherClassId, ['Zaharia Dan'], '2026-10-06T08:00:00.000Z');
    const otherTeacherId = await api.addTeacher('other@example.com', 'Alt Profesor');

    expect((await listClassStudents(api.db, api.teacherId, otherClassId)).map((s) => s.fullName)).toEqual(['Zaharia Dan']);
    expect(await listClassStudents(api.db, otherTeacherId, otherClassId)).toEqual([]);
  });
});
