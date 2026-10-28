import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
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
// holds only base64 characters and "$", so neither can carry a quote.
export function passwordSql(email: string, passwordHash: string): string {
  if (!EMAIL.test(email) || !/^[A-Za-z0-9+/=$-]+$/.test(passwordHash)) throw new Error('bad input');
  return [
    `UPDATE teachers SET password_hash = '${passwordHash}', failed_logins = 0, locked_until = NULL WHERE email = '${email}'`,
    `DELETE FROM sessions WHERE teacher_id IN (SELECT id FROM teachers WHERE email = '${email}')`,
  ].join('; ');
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const output = rl as unknown as { _writeToOutput: (text: string) => void };
    let asked = false;
    output._writeToOutput = (text) => {
      if (!asked) {
        process.stdout.write(text);
        asked = true;
      }
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const local = args.includes('--local');
  const email = normalizeEmail(args.find((arg) => !arg.startsWith('--')) ?? '');
  if (!EMAIL.test(email)) {
    console.error('Folosire: npm run set-password -- <email> [--local]');
    process.exit(1);
  }
  const password = await askHidden(`Parola nouă pentru ${email}: `);
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    console.error(`Parola are între ${MIN_PASSWORD_LENGTH} și ${MAX_PASSWORD_LENGTH} de caractere.`);
    process.exit(1);
  }
  if ((await askHidden('Scrie parola încă o dată: ')) !== password) {
    console.error('Parolele nu sunt la fel.');
    process.exit(1);
  }
  const sql = passwordSql(email, await hashPassword(password));
  const result = spawnSync('npx', ['wrangler', 'd1', 'execute', 'quickeval', local ? '--local' : '--remote', '--command', `"${sql}"`], {
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`Gata. Verifică mai sus că o linie a fost schimbată ("changes": 1): altfel ${email} nu are cont.`);
}

if (import.meta.main) await main();
