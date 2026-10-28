import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, normalizeEmail } from '../shared/accounts.ts';
import { hashPassword } from '../server/passwords.ts';

// `npm run set-password -- <email>` (add `--local` for the local database):
// sets the password of an account straight in D1 with wrangler, and ends its
// logins. For the administrators' first password, and for an administrator
// who forgot theirs (another administrator can also do it on Setări). The
// password is typed here and never shown; only its hash reaches the database.
// Messages are in Romanian: an administrator runs it.

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

// The SQL that sets the hash. The email is checked against EMAIL and the hash
// holds only base64 characters and "$", so neither can carry a quote. It goes
// to wrangler in a file: a shell would read the "$" of the hash as variables.
export function passwordSql(email: string, passwordHash: string): string {
  if (!EMAIL.test(email) || !/^[A-Za-z0-9+/=$-]+$/.test(passwordHash)) throw new Error('bad input');
  return [
    `UPDATE teachers SET password_hash = '${passwordHash}', failed_logins = 0, locked_until = NULL WHERE email = '${email}'`,
    `DELETE FROM sessions WHERE teacher_id IN (SELECT id FROM teachers WHERE email = '${email}')`,
    // Read back by the script: 1 when the account exists and has the new password.
    `SELECT COUNT(*) AS changed FROM teachers WHERE email = '${email}' AND password_hash = '${passwordHash}'`,
  ].join(';\n') + ';\n';
}

// The last result of `wrangler d1 execute --json`: whether the password is set.
export function passwordWasSet(wranglerJson: string): boolean {
  try {
    const results = JSON.parse(wranglerJson) as { results?: { changed?: number }[] }[];
    return results.at(-1)?.results?.[0]?.changed === 1;
  } catch {
    return false;
  }
}

// Asks questions on one reader and keeps the lines that come before their
// question (piped input). The reader echoes what is typed into a stream that
// drops it, so the password never shows; the questions go to stdout.
function hiddenAsker(): { ask: (question: string) => Promise<string>; close: () => void } {
  const silent = new Writable({ write: (_chunk, _encoding, done) => done() });
  const rl = createInterface({ input: process.stdin, output: silent, terminal: Boolean(process.stdin.isTTY) });
  const lines: string[] = [];
  const waiting: ((line: string) => void)[] = [];
  rl.on('line', (line) => {
    const next = waiting.shift();
    if (next) next(line);
    else lines.push(line);
  });
  rl.on('close', () => {
    for (const next of waiting.splice(0)) next('');
  });
  return {
    ask: (question) => {
      process.stdout.write(question);
      return new Promise((resolve) => {
        const line = lines.shift();
        const done = (answer: string) => {
          process.stdout.write('\n');
          resolve(answer);
        };
        if (line !== undefined) done(line);
        else waiting.push(done);
      });
    },
    close: () => rl.close(),
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const local = args.includes('--local');
  const email = normalizeEmail(args.find((arg) => !arg.startsWith('--')) ?? '');
  if (!EMAIL.test(email)) {
    console.error('Folosire: npm run set-password -- <email> [--local]');
    process.exit(1);
  }
  const asker = hiddenAsker();
  const password = await asker.ask(`Parola nouă pentru ${email}: `);
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    console.error(`Parola are între ${MIN_PASSWORD_LENGTH} și ${MAX_PASSWORD_LENGTH} de caractere.`);
    process.exit(1);
  }
  const again = await asker.ask('Scrie parola încă o dată: ');
  asker.close();
  if (again !== password) {
    console.error('Parolele nu sunt la fel.');
    process.exit(1);
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'quickeval-'));
  const file = path.join(dir, 'password.sql');
  writeFileSync(file, passwordSql(email, await hashPassword(password)));
  let result: ReturnType<typeof spawnSync>;
  try {
    // npx is npx.cmd on Windows, which runs only through a shell. The file's
    // path is the only argument that could need quotes.
    result = spawnSync('npx', ['wrangler', 'd1', 'execute', 'quickeval', local ? '--local' : '--remote', '--json', '--file', `"${file}"`], {
      stdio: ['inherit', 'pipe', 'inherit'],
      shell: true,
      encoding: 'utf8',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  if (result.status !== 0) {
    console.error(String(result.stdout ?? ''));
    process.exit(result.status ?? 1);
  }
  if (!passwordWasSet(String(result.stdout ?? ''))) {
    console.error(`${email} nu are cont în baza de date: nicio parolă nu a fost schimbată.`);
    process.exit(1);
  }
  console.log(`Gata: ${email} intră acum cu parola nouă.`);
}

if (import.meta.main) await main();
