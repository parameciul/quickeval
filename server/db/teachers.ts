import type { D1Database } from '@cloudflare/workers-types';
import type { Teacher } from '../../shared/api.ts';

// The first teacher, who runs the app: the only one who may change what is shared
// by every teacher (the robot's key and settings).
export async function isOwner(db: D1Database, teacherId: number): Promise<boolean> {
  const row = await db.prepare('SELECT MIN(id) AS owner FROM teachers').first<{ owner: number | null }>();
  return row?.owner === teacherId;
}

export async function findTeacherByEmail(db: D1Database, email: string): Promise<Teacher | null> {
  return db.prepare('SELECT id, email, name FROM teachers WHERE email = ?').bind(email.toLowerCase()).first<Teacher>();
}
