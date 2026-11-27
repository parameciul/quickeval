import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import headers from '../../public/_headers?raw';
import redirects from '../../public/_redirects?raw';
import page from '../../phone/index.html?raw';
import type { PhoneLinkInfo, TestPhonePart } from '../../shared/testPhone.ts';
import { ApiError } from '../ui/ApiError.ts';
import { tryQueryClient } from '../try/queryClient.ts';
import type { PhoneApi } from './api.ts';
import { PhoneApp } from './PhoneApp.tsx';

vi.mock('../ui/picturesPdf.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ui/picturesPdf.ts')>();
  return {
    ...actual,
    picturesToPdf: vi.fn(async (pictures: readonly File[], name: string) => ({
      file: new File([pictures.map((picture) => picture.name).join('|')], name, { type: 'application/pdf' }),
    })),
  };
});

const TOKEN = 'p'.repeat(40);
const pdf = (name: string) => new File(['%PDF-1.7'], name, { type: 'application/pdf' });
const jpeg = (name: string) => new File([new Uint8Array(10)], name, { type: 'image/jpeg' });

// A fake link: what the test has, kept up to date by the sends.
function fakePhoneApi(over: Partial<PhoneLinkInfo> = {}) {
  const info: PhoneLinkInfo = {
    code: '6E2-26T1',
    title: 'Fracții',
    className: '6E2',
    expiresAt: '2026-10-07T10:00:00.000Z',
    ces: false,
    files: { test: false, barem: false, cesTest: false, cesBarem: false },
    barem: { request: 'none', unchecked: false },
    cesBarem: { request: 'none', unchecked: false },
    ...over,
  };
  return {
    info: vi.fn(async () => structuredClone(info)),
    send: vi.fn(async (_code: string, part: TestPhonePart, _file: File) => {
      info.files[part] = true;
    }),
    generateBarem: vi.fn(async (_code: string, part: 'barem' | 'cesBarem') => {
      info[part === 'barem' ? 'barem' : 'cesBarem'].request = 'requested';
    }),
  } satisfies PhoneApi;
}

function show(api: PhoneApi, search = '', token: string | null = TOKEN) {
  window.history.replaceState(null, '', `/phone/${token ?? 'bad'}${search}`);
  render(
    <QueryClientProvider client={tryQueryClient()}>
      <PhoneApp token={token} api={api} />
    </QueryClientProvider>,
  );
}

const pick = (picked: File[]) => userEvent.upload(screen.getByLabelText('Alege fișiere'), picked);

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:preview'), configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
});

describe("a teacher's phone page", () => {
  it('takes the parts its address names, in order, and asks for the barem made from the test once it is sent', async () => {
    const api = fakePhoneApi();
    show(api, '?parts=test,sen-test&from-test=marking-scheme');
    expect(await screen.findByRole('heading', { level: 1, name: 'Testul' })).toBeInTheDocument();
    expect(screen.getByText('Fracții · 6E2')).toBeInTheDocument();
    const strip = screen.getByRole('list', { name: 'Pașii' });
    expect(within(strip).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Testul', 'Testul CES']);

    await pick([jpeg('a.jpg'), jpeg('b.jpg')]);
    await userEvent.click(screen.getByRole('button', { name: 'Trimite și continuă' }));
    await waitFor(() => expect(api.send).toHaveBeenCalledWith('6E2-26T1', 'test', expect.any(File)));
    expect(api.send.mock.calls[0]![2].name).toBe('Testul.pdf');
    expect(api.generateBarem).toHaveBeenCalledWith('6E2-26T1', 'barem');
    expect(await screen.findByRole('heading', { level: 1, name: /^Testul CES/ })).toBeInTheDocument();

    await pick([pdf('Test adaptat.pdf')]);
    await userEvent.click(screen.getByRole('button', { name: 'Trimite' }));
    expect(await screen.findByRole('heading', { name: 'Pozele au ajuns' })).toBeInTheDocument();
    expect(api.send).toHaveBeenLastCalledWith('6E2-26T1', 'cesTest', expect.objectContaining({ name: 'Test adaptat.pdf' }));
    expect(api.generateBarem).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Sunt pe calculator.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Deschide testul' })).not.toBeInTheDocument();
  });

  it('takes what the test misses when its address names nothing', async () => {
    show(fakePhoneApi({ ces: true, files: { test: true, barem: false, cesTest: false, cesBarem: false } }));
    const strip = await screen.findByRole('list', { name: 'Pașii' });
    expect(within(strip).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Baremul', 'Testul CES', 'Baremul CES']);
  });

  it('says nothing is missing when the test has every part', async () => {
    show(fakePhoneApi({ files: { test: true, barem: true, cesTest: false, cesBarem: false } }), '?here=1');
    expect(await screen.findByRole('heading', { name: 'Nu lipsește nimic' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Deschide testul' })).toHaveAttribute('href', '/teacher/tests/6E2-26T1#prepare');
  });

  it('shows a refused barem request on the test that arrived, and asks again', async () => {
    const api = fakePhoneApi();
    api.generateBarem.mockRejectedValueOnce(new ApiError(409, 'barem_day_limit', 'Ai generat azi toate baremele.'));
    show(api, '?parts=test&from-test=marking-scheme');
    await screen.findByRole('heading', { level: 1, name: 'Testul' });
    await pick([pdf('Test.pdf')]);
    await userEvent.click(screen.getByRole('button', { name: 'Trimite' }));
    expect(await screen.findByText('Testul a ajuns.')).toBeInTheDocument();
    expect(screen.getByText('Ai generat azi toate baremele.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fă baremul din test' }));
    await waitFor(() => expect(api.generateBarem).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Fă baremul din test' })).not.toBeInTheDocument());
  });

  it('shows a barem request refused again after the photos were taken again', async () => {
    const api = fakePhoneApi();
    api.generateBarem.mockRejectedValue(new ApiError(409, 'barem_day_limit', 'Ai generat azi toate baremele.'));
    show(api, '?parts=test&from-test=marking-scheme');
    await screen.findByRole('heading', { level: 1, name: 'Testul' });
    await pick([pdf('Test.pdf')]);
    await userEvent.click(screen.getByRole('button', { name: 'Trimite' }));
    expect(await screen.findByText('Testul a ajuns.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fă din nou pozele' }));
    await pick([pdf('Test nou.pdf')]);
    await userEvent.click(screen.getByRole('button', { name: 'Trimite' }));
    await waitFor(() => expect(api.generateBarem).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Testul a ajuns.')).toBeInTheDocument();
    expect(screen.getByText('Ai generat azi toate baremele.')).toBeInTheDocument();
    expect(api.send).toHaveBeenCalledTimes(2);
  });

  it('shows a refused send and stays on the step', async () => {
    const api = fakePhoneApi();
    api.send.mockRejectedValueOnce(new ApiError(409, 'evaluating', 'Testul se corectează acum.'));
    show(api, '?parts=marking-scheme');
    await screen.findByRole('heading', { level: 1, name: 'Baremul' });
    await pick([pdf('Barem.pdf')]);
    await userEvent.click(screen.getByRole('button', { name: 'Trimite' }));
    expect(await screen.findByText('Testul se corectează acum.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Baremul' })).toBeInTheDocument();
  });

  it('on the phone that made the test, its last screen opens the test', async () => {
    show(fakePhoneApi(), '?parts=marking-scheme&here=1');
    await screen.findByRole('heading', { level: 1, name: 'Baremul' });
    await pick([pdf('Barem.pdf')]);
    await userEvent.click(screen.getByRole('button', { name: 'Trimite' }));
    expect(await screen.findByRole('link', { name: 'Deschide testul' })).toHaveAttribute('href', '/teacher/tests/6E2-26T1#prepare');
    expect(screen.getByText('Sunt la test.')).toBeInTheDocument();
  });

  it("says when the link expired, in the server's words", async () => {
    const api = fakePhoneApi();
    api.info.mockRejectedValue(new ApiError(410, 'phone_link_expired', 'Linkul a expirat.'));
    show(api);
    expect(await screen.findByText('Linkul a expirat.')).toBeInTheDocument();
  });

  it('says a link that is not one is not good, and asks nothing', () => {
    const api = fakePhoneApi();
    show(api, '', null);
    expect(screen.getByRole('alert')).toHaveTextContent('Linkul nu este bun.');
    expect(api.info).not.toHaveBeenCalled();
  });
});

// The page is private like a Quick Try's: never indexed, and every address
// under /phone/ loads the same page.
describe('the phone page on Pages', () => {
  it('loads phone/index.html for every /phone/<token>, in the directory form, never indexed', () => {
    expect(redirects.split('\n')).toContain('/phone/* /phone/ 200');
    expect(headers).toMatch(/^\/phone\/\*\n {2}X-Robots-Tag: noindex, nofollow$/m);
    expect(page).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(page).toContain('<meta name="referrer" content="no-referrer" />');
    expect(page).toContain('<script type="module" src="/src/phone/main.tsx"></script>');
  });
});
