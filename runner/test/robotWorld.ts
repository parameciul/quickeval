import { addSubmission, addTestFiles, makeClass, makeTest, ROBOT_KEY, setRobotKey, startTest, testIdOf } from '../../server/test/fixtures.ts';
import { startTestApi, type TestApi } from '../../server/test/testApi.ts';
import type { Fetch } from '../api.ts';

// Robot tests run against the real API app, in this process, with the local
// D1 and R2 engines (server/test/testApi.ts).

export const API_URL = 'https://quickeval.test';
export { ROBOT_KEY };

// The robot's requests go to the API app of the test.
export function fetchFrom(api: TestApi): Fetch {
  return (url, init) => {
    if (!url.startsWith(API_URL)) throw new Error(`unexpected URL ${url}`);
    return api.fetch(url.slice(API_URL.length), init);
  };
}

export interface RobotWorld {
  api: TestApi;
  code: string;
  testId: number;
  // In the order they were sent.
  submissionIds: number[];
}

const NAMES = ['Pop Ion', 'Ionescu Ana', 'Stan Eva', 'Dinu Maria'];

// A test in evaluation with the robot key set: its test and barem are PDFs in
// R2, and `uploads` students sent `pages` JPEG pages each, also in R2.
export async function evaluatingTest(options: { uploads?: number; pages?: number } = {}): Promise<RobotWorld> {
  const uploads = options.uploads ?? 1;
  const pages = options.pages ?? 2;
  const api = await startTestApi();
  try {
    await setRobotKey(api);
    const cls = await makeClass(api, '6E2', NAMES.slice(0, Math.max(uploads, 1)));
    const code = await makeTest(api, cls.id);
    const testId = await testIdOf(api, code);
    await startTest(api, code);
    await addTestFiles(api, code);
    await api.env.FILES.put(`fixture/${code}/test.pdf`, '%PDF-1.7 test');
    await api.env.FILES.put(`fixture/${code}/barem.pdf`, '%PDF-1.7 barem');
    const submissionIds: number[] = [];
    for (let index = 0; index < uploads; index++) {
      const id = await addSubmission(api, code, cls.studentIds[index]!, { status: 'submitted', files: pages });
      await api.db.prepare('UPDATE submissions SET submitted_at = ? WHERE id = ?').bind(`2026-10-07T08:${10 + index}:00.000Z`, id).run();
      for (let position = 1; position <= pages; position++) {
        await api.env.FILES.put(`fixture/${id}/${position}.jpg`, `jpeg ${id}-${position}`);
      }
      submissionIds.push(id);
    }
    await api.db.prepare("UPDATE tests SET status = 'evaluating', evaluation_started_at = '2026-10-07T09:00:00.000Z' WHERE id = ?").bind(testId).run();
    return { api, code, testId, submissionIds };
  } catch (err) {
    await api.dispose();
    throw err;
  }
}
