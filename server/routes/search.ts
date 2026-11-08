import { Hono } from 'hono';
import { isSearchable, MAX_SEARCH_LENGTH } from '../../shared/search.ts';
import { search } from '../db/search.ts';
import type { AppEnv } from '../env.ts';
import { ApiError } from '../errors.ts';
import { parseSchoolYear } from '../http.ts';

// /api/admin/search?q=stef&year=2026: the teacher's students, classes and
// tests of the school year whose name holds the search (redesign spec §11.10).
export function searchRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/', async (c) => {
    const year = parseSchoolYear(c.req.query('year'));
    const query = (c.req.query('q') ?? '').trim();
    if (query.length > MAX_SEARCH_LENGTH) throw new ApiError(400, 'invalid', 'Caută cel mult 80 de caractere.');
    if (!isSearchable(query)) throw new ApiError(400, 'invalid', 'Scrie cel puțin două litere.');
    return c.json(await search(c.env.DB, c.var.teacher.id, year, query));
  });

  return routes;
}
