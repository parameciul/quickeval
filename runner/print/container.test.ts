import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const FOLDER = path.resolve(import.meta.dirname);
const IMAGE = 'quickeval-print-test';

// Builds the print image and runs the Python tests inside it. Slow, so it runs
// only when QE_PRINT_IMAGE_TESTS=1.
describe.skipIf(process.env.QE_PRINT_IMAGE_TESTS !== '1')('print container', () => {
  it('builds the image and passes its Python tests', { timeout: 20 * 60_000 }, () => {
    const build = spawnSync('docker', ['build', '-t', IMAGE, FOLDER], { encoding: 'utf8', timeout: 15 * 60_000 });
    expect(build.status, build.stderr).toBe(0);
    const run = spawnSync(
      'docker',
      [
        'run', '--rm', '-v', `${FOLDER}:/tests:ro`, IMAGE, 'sh', '-c',
        'pip3 install --break-system-packages opencv-python-headless && python3 -m unittest discover -s /tests -p test_print.py -v',
      ],
      { encoding: 'utf8', timeout: 5 * 60_000, env: { ...process.env, MSYS_NO_PATHCONV: '1' } },
    );
    expect(run.status, run.stdout + run.stderr).toBe(0);
  });
});
