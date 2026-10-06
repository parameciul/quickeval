import type { D1Database } from '@cloudflare/workers-types';
import type { Teacher } from '../../shared/api.ts';

export async function findTeacherByEmail(db: D1Database, email: string): Promise<Teacher | null> {
  return db.prepare('SELECT id, email, name FROM teachers WHERE email = ?').bind(email.toLowerCase()).first<Teacher>();
}
