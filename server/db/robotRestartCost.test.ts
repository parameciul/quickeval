import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApi, type TestApi } from '../test/testApi.ts';
import { countingRows } from '../test/rowsRead.ts';
import { claimRobotRestart } from './runner.ts';

// The restart check runs on every version read of every open teacher tab
// (once a minute) and on every status read of an open try page: when no start
// is due, it must read one row.

let api: TestApi;
const NOW = '2026-11-26T10:00:00.000Z';

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  await api.dispose();
});

describe('the restart check', () => {
  it('reads one row when no restart is due', async () => {
    await api.db.prepare("UPDATE runner_state SET restart_at = '2026-11-26T09:59:00.000Z', last_check_at = NULL").run();
    for (const lane of ['main', 'try'] as const) {
      const counted = countingRows(api.db);
      expect(await claimRobotRestart(counted.db, lane, NOW)).toBe(false);
      expect(counted.rows()).toBeLessThanOrEqual(1);
    }
  });

  it('reads one row while a run is alive', async () => {
    await api.db.prepare("UPDATE runner_state SET restart_at = NULL, run_id = 'run-00000001', heartbeat_at = '2026-11-26T09:59:30.000Z'").run();
    const counted = countingRows(api.db);
    expect(await claimRobotRestart(counted.db, 'main', NOW)).toBe(false);
    expect(counted.rows()).toBeLessThanOrEqual(1);
  });
});
