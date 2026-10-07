import { Hono } from 'hono';
import { deleteSubmissionRow, findTeacherFile, getTeacherSubmission } from '../db/submissions.ts';
import type { AppEnv } from '../env.ts';
import { notFound } from '../errors.ts';
import { parseId } from '../http.ts';
import { deleteFilesQuietly, fileResponse } from '../uploads.ts';

// /api/admin/submissions: one student's upload for one test.
export function submissionRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/:id', async (c) => {
    const found = await getTeacherSubmission(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')));
    if (!found) throw notFound();
    return c.json({ submission: found.detail });
  });

  routes.get('/:id/files/:fileId', async (c) => {
    const file = await findTeacherFile(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')), parseId(c.req.param('fileId')));
    const object = file ? await c.env.FILES.get(file.key) : null;
    if (!file || !object) throw notFound();
    return fileResponse(object, file.name, file.type);
  });

  // Deletes the upload and its files, so the student can start again
  // (for example on another phone).
  routes.post('/:id/reset', async (c) => {
    const found = await getTeacherSubmission(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')));
    if (!found) throw notFound();
    await deleteSubmissionRow(c.env.DB, found.detail.id);
    await deleteFilesQuietly(c.env.FILES, found.files.map((file) => file.key));
    return c.json({ reset: true });
  });

  return routes;
}
