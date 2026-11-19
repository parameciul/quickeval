// Reads a Vitest JSON report and prints where the test time goes.
// Usage: node scripts/testTimes.mjs <report.json>
// Exits with 1 when a test file is over the budget (TEST_FILE_BUDGET_SECONDS, default 15).

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const round = (ms) => Math.round(ms) / 1000;

// Area: the first path part, plus the second for src/ (src/admin, src/upload, ...).
function areaOf(file) {
  const parts = file.split('/');
  return parts[0] === 'src' ? `src/${parts[1]}` : parts[0];
}

export function summarize(report, root) {
  const base = root.replace(/\\/g, '/').replace(/\/$/, '') + '/';
  const relative = (name) => name.replace(/\\/g, '/').replace(base, '');
  const files = [];
  const tests = [];
  const areas = new Map();

  for (const result of report.testResults) {
    const file = relative(result.name);
    const durations = result.assertionResults.map((a) => a.duration ?? 0);
    const ms = durations.reduce((sum, d) => sum + d, 0);
    files.push({ file, tests: durations.length, seconds: round(ms) });
    for (const a of result.assertionResults) {
      tests.push({ name: `${file} > ${a.title}`, seconds: round(a.duration ?? 0) });
    }
    const area = areaOf(file);
    const row = areas.get(area) ?? { area, files: 0, tests: 0, seconds: 0 };
    row.files += 1;
    row.tests += durations.length;
    row.seconds += ms / 1000;
    areas.set(area, row);
  }

  return {
    areas: [...areas.values()]
      .map((row) => ({ ...row, seconds: Math.round(row.seconds * 10) / 10 }))
      .sort((a, b) => b.seconds - a.seconds),
    files: files.sort((a, b) => b.seconds - a.seconds),
    tests: tests.sort((a, b) => b.seconds - a.seconds),
  };
}

export function overBudget(files, budgetSeconds) {
  return files.filter((f) => f.seconds > budgetSeconds);
}

function printTable(title, rows) {
  console.log(`\n${title}`);
  for (const row of rows) console.log(row);
}

const REPORT = '.vitest-times.json';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // `--run` runs the whole suite first and writes the report; otherwise it reads one.
  let reportPath = process.argv[2];
  if (reportPath === '--run') {
    // One command line through the shell: npx is npx.cmd on Windows.
    spawnSync(`npx vitest run --reporter=default --reporter=json --outputFile.json=${REPORT}`, { stdio: 'inherit', shell: true });
    reportPath = REPORT;
  }
  if (!reportPath) {
    console.error('Usage: node scripts/testTimes.mjs <report.json> | --run');
    process.exit(2);
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const root = process.cwd();
  const { areas, files, tests } = summarize(report, root);
  const budget = Number(process.env.TEST_FILE_BUDGET_SECONDS ?? 15);

  printTable('Time by area (seconds)', areas);
  printTable('20 slowest files', files.slice(0, 20));
  printTable('20 slowest tests', tests.slice(0, 20));

  const late = overBudget(files, budget);
  if (late.length > 0) {
    console.error(`\n${late.length} file(s) over the ${budget} s budget:`);
    for (const f of late) console.error(`  ${f.seconds} s  ${f.file}`);
    process.exit(1);
  }
  console.log(`\nEvery file is within the ${budget} s budget.`);
}
