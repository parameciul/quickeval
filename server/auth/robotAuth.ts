import type { MiddlewareHandler } from 'hono';
import { getRobotKeyHash } from '../db/settings.ts';
import type { AppEnv } from '../env.ts';
import { ApiError } from '../errors.ts';
import { constantTimeEqual, sha256Hex } from '../secrets.ts';

const BEARER = /^Bearer ([A-Za-z0-9_-]{20,200})$/;

// The robot sends Authorization: Bearer <key>. The API keeps only the key's
// SHA-256 and compares the hashes in constant time (spec §11.3). Without a
// stored key, every robot request is refused.
export function robotAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const key = BEARER.exec(c.req.header('Authorization') ?? '')?.[1];
    const stored = await getRobotKeyHash(c.env.DB);
    if (!key || !stored || !constantTimeEqual(await sha256Hex(key), stored)) {
      throw new ApiError(401, 'robot_denied', 'Cheia robotului lipsește sau este greșită.');
    }
    await next();
  };
}
