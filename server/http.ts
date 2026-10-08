import type { Context, MiddlewareHandler } from 'hono';
import type { z } from 'zod';
import { parsePositiveId } from '../shared/ids.ts';
import { isValidSchoolYear, schoolYearOf } from '../shared/schoolYear.ts';
import { normalizeTestCode } from '../shared/tests.ts';
import { promoteDueTests } from './db/lifecycle.ts';
import type { AppEnv } from './env.ts';
import { ApiError, notFound } from './errors.ts';

// Reads a JSON body and checks it with a zod schema. The first problem becomes
// a 400 with the schema's Romanian message. A body over `maxBytes` gets 413.
export async function readJson<Schema extends z.ZodType>(c: Context, schema: Schema, maxBytes?: number): Promise<z.output<Schema>> {
  const type = c.req.header('Content-Type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'bad_content_type', 'Cererea trebuie trimisă ca JSON.');
  }
  const tooLarge = () => new ApiError(413, 'too_large', 'Cererea este prea mare.');
  if (maxBytes !== undefined && Number(c.req.header('Content-Length') ?? 0) > maxBytes) throw tooLarge();
  const bytes = await c.req.arrayBuffer();
  if (maxBytes !== undefined && bytes.byteLength > maxBytes) throw tooLarge();
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError(400, 'bad_json', 'Cererea nu este JSON valid.');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, 'invalid', parsed.error.issues[0]?.message ?? 'Datele trimise nu sunt valide.');
  }
  return parsed.data;
}

// Route ids are positive integers. Anything else is a page that does not exist.
export function parseId(raw: string | undefined): number {
  const id = parsePositiveId(raw);
  if (id === null) throw notFound();
  return id;
}

// Test codes in routes, in any letter case. Anything else is a page that does not exist.
export function parseTestCode(raw: string | undefined): string {
  const code = normalizeTestCode(raw ?? '');
  if (code === null) throw notFound();
  return code;
}

// The ?year= of a list; the current school year when it is missing.
export function parseSchoolYear(raw: string | undefined): number {
  const year = raw === undefined ? schoolYearOf(new Date()) : Number(raw);
  if (!isValidSchoolYear(year)) throw new ApiError(400, 'invalid', 'Anul școlar nu este valid.');
  return year;
}

// Writes must come from our own pages. A cross-site form or fetch carries
// Sec-Fetch-Site or an Origin from another site; both are refused.
export const sameOriginWrites: MiddlewareHandler = async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const site = c.req.header('Sec-Fetch-Site');
    const origin = c.req.header('Origin');
    if ((site && site !== 'same-origin') || (origin && origin !== new URL(c.req.url).origin)) {
      throw new ApiError(403, 'cross_site', 'Cererea vine de pe alt site și a fost refuzată.');
    }
  }
  await next();
};

export function nowIso(): string {
  return new Date().toISOString();
}

// Teacher and student requests first start the evaluations whose scheduled
// time has come, so every page shows a scheduled test closed on time (spec §8.3).
export const promoteDue: MiddlewareHandler<AppEnv> = async (c, next) => {
  await promoteDueTests(c.env.DB, nowIso());
  await next();
};
