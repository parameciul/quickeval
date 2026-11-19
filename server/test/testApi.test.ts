import { expect, it } from 'vitest';
import { startTestApi } from './testApi.ts';

// The in-process engine answers at once, so work a route leaves running after
// its answer could land after the next test's reset. dispose() waits for it.
it('a write left running does not reach the next test', async () => {
  const api = await startTestApi({
    env: { DEV_TEACHER_EMAIL: undefined },
    app: {
      // The sign-up email goes out after the answer; this one writes a row late.
      sendEmail: async (env) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        await env.DB.prepare(
          "INSERT INTO teachers (email, name, created_at, role, demo) VALUES ('late@example.com', 'Late', '2026-10-06T08:00:00.000Z', 'teacher', 1)",
        ).run();
        return true;
      },
    },
  });
  // fetch() does not wait for the background work.
  const res = await api.fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Ana Pop', email: 'ana.pop@example.com', password: 'parola-lunga' }),
  });
  expect(res.status).toBe(201);
  await api.dispose();

  const next = await startTestApi();
  await new Promise((resolve) => setTimeout(resolve, 40));
  expect(await next.db.prepare("SELECT COUNT(*) AS n FROM teachers WHERE email = 'late@example.com'").first('n')).toBe(0);
  await next.dispose();
});
