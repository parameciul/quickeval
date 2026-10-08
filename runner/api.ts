import type { z } from 'zod';
import type { ExerciseListInfo } from '../shared/api.ts';
import type {
  CheckResult,
  ClaimResult,
  exerciseListBody,
  LeaseResult,
  resultBody,
  RobotTest,
  RunSummary,
  TasksResult,
} from '../shared/runner.ts';

// The robot's client of the robot API (/api/runner, spec §11.3). It loads no
// package, only types: check.ts uses it before `npm ci`.

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export type ExerciseListPost = z.input<typeof exerciseListBody>;
export type ResultPost = z.input<typeof resultBody>;

// A refused request: `code` is the API's error code ("lease_lost",
// "taken_over", …), "network" when the API could not be reached, or
// "http_<status>" for an answer without a code.
export class RobotApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`robot API: ${status} ${code}`);
    this.status = status;
    this.code = code;
  }
}

export interface RobotApi {
  check(): Promise<CheckResult>;
  lease(runId: string): Promise<LeaseResult>;
  // Throws RobotApiError 409 "lease_lost" when another run holds the lease.
  heartbeat(runId: string): Promise<void>;
  release(runId: string, summary: RunSummary): Promise<void>;
  tasks(): Promise<TasksResult>;
  test(testId: number): Promise<RobotTest>;
  testFile(testId: number, kind: 'test' | 'barem'): Promise<Uint8Array>;
  sendExerciseList(testId: number, body: ExerciseListPost): Promise<ExerciseListInfo>;
  // Null when nothing can be graded now.
  claim(runId: string): Promise<ClaimResult | null>;
  page(submissionId: number, fileId: number): Promise<Uint8Array>;
  sendResult(submissionId: number, body: ResultPost): Promise<'graded' | 'submitted' | 'failed'>;
}

export interface RobotApiOptions {
  fetch?: Fetch;
  // How long one request may take.
  timeoutMs?: number;
  // A network error or a 5xx answer is tried again, up to `tries` times in all,
  // after `retryDelayMs`, then twice that.
  tries?: number;
  retryDelayMs?: number;
}

export function robotApi(baseUrl: string, key: string, options: RobotApiOptions = {}): RobotApi {
  const fetchFn = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const tries = options.tries ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 5_000;
  const root = `${baseUrl.replace(/\/+$/, '')}/api/runner`;

  async function send(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    for (let attempt = 1; ; attempt++) {
      let res: Response | null = null;
      try {
        res = await fetchFn(`${root}${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        if (attempt >= tries) throw new RobotApiError(0, 'network');
      }
      if (res && (res.status < 500 || attempt >= tries)) {
        if (res.ok) return res;
        throw new RobotApiError(res.status, await errorCode(res));
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
    }
  }

  const json = async <T>(method: string, path: string, body?: unknown): Promise<T> => (await (await send(method, path, body)).json()) as T;
  const bytes = async (path: string) => new Uint8Array(await (await send('GET', path)).arrayBuffer());

  return {
    check: () => json<CheckResult>('POST', '/check'),
    lease: (runId) => json<LeaseResult>('POST', '/lease', { runId }),
    heartbeat: async (runId) => {
      await send('POST', '/heartbeat', { runId });
    },
    release: async (runId, summary) => {
      await send('POST', '/release', { runId, summary });
    },
    tasks: () => json<TasksResult>('GET', '/tasks'),
    test: async (testId) => (await json<{ test: RobotTest }>('GET', `/tests/${testId}`)).test,
    testFile: (testId, kind) => bytes(`/tests/${testId}/files/${kind}`),
    sendExerciseList: async (testId, body) =>
      (await json<{ exerciseList: ExerciseListInfo }>('POST', `/tests/${testId}/exercise-list`, body)).exerciseList,
    claim: async (runId) => {
      const res = await send('POST', '/claim', { runId });
      return res.status === 204 ? null : ((await res.json()) as ClaimResult);
    },
    page: (submissionId, fileId) => bytes(`/submissions/${submissionId}/files/${fileId}`),
    sendResult: async (submissionId, body) =>
      (await json<{ status: 'graded' | 'submitted' | 'failed' }>('POST', `/submissions/${submissionId}/result`, body)).status,
  };
}

async function errorCode(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // Not JSON: a proxy or a login page answered.
  }
  return `http_${res.status}`;
}

// The robot API from the environment (QUICKEVAL_URL and QUICKEVAL_RUNNER_KEY,
// spec §12.1); null while the robot is not set up.
export function robotApiFromEnv(env: Record<string, string | undefined>, options: RobotApiOptions = {}): RobotApi | null {
  const url = env.QUICKEVAL_URL?.trim();
  const key = env.QUICKEVAL_RUNNER_KEY?.trim();
  return url && key ? robotApi(url, key, options) : null;
}
