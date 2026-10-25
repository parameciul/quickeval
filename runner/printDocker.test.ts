import { beforeEach, describe, expect, it, vi } from 'vitest';

// The docker client as execFile runs it: each call answers with the error
// that `answer` gives for its arguments.
const docker = vi.hoisted(() => ({
  calls: [] as string[][],
  answer: (_args: string[]): Error | null => null,
}));

vi.mock('node:child_process', () => ({
  execFile: (_file: string, args: string[], _options: unknown, callback: (err: Error | null) => void) => {
    docker.calls.push(args);
    queueMicrotask(() => callback(docker.answer(args)));
  },
}));

const { dockerTools } = await import('./printTask.ts');

function execError(fields: { killed?: boolean; code?: string | number }): Error {
  return Object.assign(new Error('Command failed: docker run quickeval-print python3 /app/stamp_qr.py'), fields);
}

const kills = () => docker.calls.filter((args) => args[0] === 'kill');

beforeEach(() => {
  docker.calls = [];
  docker.answer = () => null;
});

describe('dockerTools', () => {
  it('kills the container when the step timed out', async () => {
    docker.answer = (args) => (args[0] === 'run' ? execError({ killed: true }) : null);
    await expect(dockerTools('/print').run(['true'], '/work', 1_000)).rejects.toMatchObject({ kind: 'timeout' });
    const name = docker.calls[0]![docker.calls[0]!.indexOf('--name') + 1];
    expect(kills()).toEqual([['kill', name]]);
  });

  it('kills the container when the client was stopped for too much output', async () => {
    docker.answer = (args) => (args[0] === 'run' ? execError({ killed: true, code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }) : null);
    await expect(dockerTools('/print').run(['true'], '/work', 1_000)).rejects.toMatchObject({ kind: 'failed' });
    expect(kills()).toHaveLength(1);
  });

  it('kills nothing when the step ended with an error of its own', async () => {
    docker.answer = (args) => (args[0] === 'run' ? execError({ code: 1 }) : null);
    await expect(dockerTools('/print').run(['true'], '/work', 1_000)).rejects.toMatchObject({ kind: 'failed' });
    expect(kills()).toEqual([]);
  });

  it('runs the step without network, with the folder at /work', async () => {
    await dockerTools('/print').run(['python3', '/app/stamp_qr.py'], '/work', 1_000);
    const args = docker.calls[0]!;
    expect(args.slice(0, 2)).toEqual(['run', '--rm']);
    expect(args).toContain('none');
    expect(args.slice(-3)).toEqual(['quickeval-print', 'python3', '/app/stamp_qr.py']);
    expect(kills()).toEqual([]);
  });
});
