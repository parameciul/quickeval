import type { PhoneLinkInfo, TestPhonePart } from '../../shared/testPhone.ts';
import { apiRequest } from '../try/api.ts';

// The calls of a teacher's phone page (/phone/<token>): what its test has, a
// file of one part, and a barem made from the test. The page gets it as a
// prop, so tests can pass a fake.
export interface PhoneApi {
  info(): Promise<PhoneLinkInfo>;
  send(code: string, part: TestPhonePart, file: File): Promise<void>;
  generateBarem(code: string, part: 'barem' | 'cesBarem'): Promise<void>;
}

// The teacher API's paths of each part, after /api/phone/<token>/tests/<code>.
const FILE_PATHS: Record<TestPhonePart, string> = {
  test: '/files/test',
  barem: '/files/marking-scheme',
  cesTest: '/sen/files/test',
  cesBarem: '/sen/files/marking-scheme',
};

export function createPhoneClient(token: string, fetchImpl: typeof fetch = (input, init) => fetch(input, init)): PhoneApi {
  const base = `/api/phone/${token}`;
  const testPath = (code: string) => `${base}/tests/${encodeURIComponent(code)}`;
  return {
    info: async () => (await apiRequest<{ info: PhoneLinkInfo }>(fetchImpl, `${base}/info`, 'GET')).info,
    send: async (code, part, file) => {
      await apiRequest(fetchImpl, `${testPath(code)}${FILE_PATHS[part]}`, 'PUT', undefined, file);
    },
    generateBarem: async (code, part) => {
      await apiRequest(fetchImpl, `${testPath(code)}${part === 'cesBarem' ? '/sen' : ''}/marking-scheme/generate`, 'POST');
    },
  };
}
