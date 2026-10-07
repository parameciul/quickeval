import type { Context, MiddlewareHandler } from 'hono';
import type { z } from 'zod';
import { parsePositiveId } from '../shared/ids.ts';
import { ApiError, notFound } from './errors.ts';

// Reads a JSON body and checks it with a zod schema. The first problem becomes
// a 400 with the schema's Romanian message.
export async function readJson<Schema extends z.ZodType>(c: Context, schema: Schema): Promise<z.output<Schema>> {
  const type = c.req.header('Content-Type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'bad_content_type', 'Cererea trebuie trimisă ca JSON.');
  }
  let body: unknown;
  try {
    body = await c.req.json();
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
