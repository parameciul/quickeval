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
// who forgot theirs (Setări never changes an administrator's password). The
// password is typed here and never shown; only its hash reaches the database.
// Messages are in Romanian: an administrator runs it.

// No "%" (cmd.exe reads %NAME% as a variable) and no quotes: the email also
// goes on a command line.
const EMAIL = /^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

// The SQL that sets the hash. The email is checked against EMAIL and the hash
// holds only base64 characters and "$", so neither can carry a quote. It goes
// to wrangler in a file: a shell would read the "$" of the hash as variables.
export function passwordSql(email: string, passwordHash: string): string {
  if (!EMAIL.test(email) || !/^[A-Za-z0-9+/=$-]+$/.test(passwordHash)) throw new Error('bad input');
  return [
    `UPDATE teachers SET password_hash = '${passwordHash}', failed_logins = 0, locked_until = NULL WHERE email = '${email}'`,
    `DELETE FROM sessions WHERE teacher_id IN (SELECT id FROM teachers WHERE email = '${email}')`,
  ].join(';\n') + ';\n';
}

// Reads the stored hash back, as a --command: on the live database a --file
// goes through D1's import, whose answer is a summary without the rows of a
// SELECT. Holds no "$", so a shell leaves it as it is.
export function storedHashSql(email: string): string {
  if (!EMAIL.test(email)) throw new Error('bad input');
  return `SELECT password_hash FROM teachers WHERE email = '${email}'`;
}

// The answer of `wrangler d1 execute --json --command`: whether the account
// now has this hash. Text before the JSON (a notice of wrangler) is skipped.
export function passwordWasSet(wranglerJson: string, passwordHash: string): boolean {
  try {
    const results = JSON.parse(wranglerJson.slice(wranglerJson.indexOf('['))) as { results?: { password_hash?: string }[] }[];
    return results.at(-1)?.results?.[0]?.password_hash === passwordHash;
  } catch {
    return false;
  }
}

// Runs wrangler on the chosen database; its JSON answer, or null when it failed.
function wrangler(target: '--local' | '--remote', args: string[]): string | null {
  // npx is npx.cmd on Windows, which runs only through a shell. The command
  // goes as one line (Node warns about separate arguments with a shell), and
  // every argument that could hold a space or a quote is quoted by the caller.
  const command = ['npx', 'wrangler', 'd1', 'execute', 'quickeval', target, '--json', ...args].join(' ');
  const result = spawnSync(command, {
    stdio: ['inherit', 'pipe', 'inherit'],
    shell: true,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error(String(result.stdout ?? ''));
    return null;
  }
  return String(result.stdout ?? '');
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
  const target = local ? '--local' : '--remote';
  const passwordHash = await hashPassword(password);
  const dir = mkdtempSync(path.join(tmpdir(), 'quickeval-'));
  const file = path.join(dir, 'password.sql');
  writeFileSync(file, passwordSql(email, passwordHash));
  let written: string | null;
  try {
    written = wrangler(target, ['--file', `"${file}"`]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  if (written === null) process.exit(1);
  const stored = wrangler(target, ['--command', `"${storedHashSql(email)}"`]);
  if (stored === null) process.exit(1);
  if (!passwordWasSet(stored, passwordHash)) {
    console.error(`${email} nu are cont în baza de date: nicio parolă nu a fost schimbată.`);
    process.exit(1);
  }
  console.log(`Gata: ${email} intră acum cu parola nouă.`);
}

if (import.meta.main) await main();
