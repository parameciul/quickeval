import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { TestInfo } from '../../../shared/api.ts';
import { PHONE_MEDIA } from '../../../shared/quickTry.ts';
import {
  isCesPart,
  missingPhoneParts,
  PHONE_LINK_HOURS,
  testPhonePath,
  type PhoneAsk,
  type PhoneLinkInfo,
  type TestPhonePart,
} from '../../../shared/testPhone.ts';
import { useApi } from '../ApiContext.tsx';
import { CesTag } from '../CesTag.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { Modal } from '../Modal.tsx';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { useMediaQuery } from '../../ui/useMediaQuery.ts';
import { currentLang } from '../../i18n/lang.ts';
import { t } from '../../i18n/t.ts';

// A phone link made for this test, and what its phone page is to do. Test nou
// hands it to the test page in the navigation state; Pregătire makes one too.
export interface PhoneWindowState {
  token: string;
  ask: PhoneAsk;
}

// While the window shows, the page asks the data version this often (two
// rows, `/api/admin/version`; the shell reads the test again when it changed,
// also for a change of another test), and stops after PHONE_WATCH_MS or once
// every part is there and every barem from the test asked for.
export const PHONE_CHECK_MS = 15_000;
export const PHONE_WATCH_MS = 15 * 60 * 1000;

// What the phone page would read of the test, from the test page's own data.
export function phoneStateOf(test: TestInfo): Pick<PhoneLinkInfo, 'ces' | 'files' | 'barem' | 'cesBarem'> {
  return {
    ces: test.ces.studentCount > 0 && !test.ces.off,
    files: {
      test: test.files.test !== null,
      barem: test.files.barem !== null,
      cesTest: test.ces.files.test !== null,
      cesBarem: test.ces.files.barem !== null,
    },
    barem: test.barem,
    cesBarem: test.ces.barem,
  };
}

const PART_TITLES: Record<TestPhonePart, () => string> = {
  test: () => t('Testul'),
  barem: () => t('Baremul'),
  cesTest: () => t('Testul CES'),
  cesBarem: () => t('Baremul CES'),
};

// "Fă poze cu telefonul" in Pregătire, while a draft or open test misses its
// test or its barem (a CES one too), and the window of its QR code: opened by
// the button, or at once when Test nou chose a part from the phone. On a phone
// the button opens the phone page itself.
export function PhonePhotos({ test }: { test: TestInfo }) {
  const api = useApi();
  const location = useLocation();
  const navigate = useNavigate();
  const onPhone = useMediaQuery(PHONE_MEDIA);
  const [shown, setShown] = useState<PhoneWindowState | null>(() => (location.state as { phone?: PhoneWindowState } | null)?.phone ?? null);
  const before = test.status === 'draft' || test.status === 'open';
  const missing = before ? missingPhoneParts(phoneStateOf(test)) : [];
  const make = useMutation({
    mutationFn: () => api.createPhoneLink(test.code),
    onSuccess: (link) => {
      const ask: PhoneAsk = { parts: missing, fromTest: [] };
      if (onPhone) window.location.assign(testPhonePath(link.token, ask, true, currentLang()));
      else setShown({ token: link.token, ask });
    },
  });
  const close = () => {
    setShown(null);
    // A reload or Back must not open it again: the address keeps its state.
    const state = location.state as { phone?: PhoneWindowState } | null;
    if (state?.phone) navigate({ hash: location.hash }, { replace: true, state: { ...state, phone: undefined } });
  };
  return (
    <>
      {missing.length > 0 && (
        <div className="phone-photos">
          <button type="button" className="button-quiet" disabled={make.isPending} onClick={() => make.mutate()}>
            <ActionIcon name="camera" />
            {onPhone ? t('Fă poze') : t('Fă poze cu telefonul')}
          </button>
          <span className="hint">{t('Testul sau baremul care lipsesc, din poze.')}</span>
        </div>
      )}
      {make.error && <ErrorMessage error={make.error} />}
      {shown && <PhoneWindow test={test} state={shown} onClose={close} />}
    </>
  );
}

// The QR code of the phone page, one for all its parts, and where each part
// is: there, waiting for its photos, or made from its test.
export function PhoneWindow({ test, state, onClose }: { test: TestInfo; state: PhoneWindowState; onClose: () => void }) {
  const queryClient = useQueryClient();
  const url = `${window.location.origin}${testPhonePath(state.token, state.ask, false, currentLang())}`;
  const now = phoneStateOf(test);
  const fromTest = state.ask.fromTest.filter((part) => !state.ask.parts.includes(part));
  const rows: { part: TestPhonePart; there: boolean; word: string }[] = [
    ...state.ask.parts.map((part) => ({ part, there: now.files[part], word: now.files[part] ? t('A ajuns') : t('Așteaptă pozele') })),
    ...fromTest.map((part) => {
      const request = part === 'barem' ? now.barem.request : now.cesBarem.request;
      const testThere = now.files[part === 'barem' ? 'test' : 'cesTest'];
      const there = now.files[part];
      const word = there
        ? t('Făcut din test')
        : request === 'requested'
          ? t('Se face din test')
          : testThere
            ? t('Nu s-a cerut: îl generezi la Pregătire')
            : t('Se face din test, după ce ajunge testul');
      return { part, there, word };
    }),
  ];
  const allThere = state.ask.parts.every((part) => now.files[part]);
  // Nothing more will come by itself: every part is there, and every barem
  // from the test is there, asked for, or could not be (its test arrived).
  const settled =
    allThere &&
    fromTest.every((part) => now.files[part] || (part === 'barem' ? now.barem.request : now.cesBarem.request) !== 'none' || now.files[part === 'barem' ? 'test' : 'cesTest']);

  useEffect(() => {
    if (settled) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started > PHONE_WATCH_MS) return window.clearInterval(timer);
      if (document.visibilityState === 'hidden') return;
      void queryClient.refetchQueries({ queryKey: ['version'] });
    }, PHONE_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [settled, queryClient]);

  return (
    <Modal title={t('Fă pozele cu telefonul')} onClose={onClose}>
      <div className="modal-body qr-window">
        <p>{t('Scanează codul cu camera telefonului.')}</p>
        <QRCodeSVG value={url} size={288} marginSize={4} title={t('Codul QR al paginii pentru poze')} className="qr-window-code" />
        <ul className="phone-rows" aria-label={t('Ce vine de pe telefon')}>
          {rows.map((row) => (
            <li key={row.part} className={row.there ? 'is-done' : undefined}>
              <span className="phone-row-mark" aria-hidden="true">
                {row.there && <ActionIcon name="check" />}
              </span>
              <span className="phone-row-name">
                {PART_TITLES[row.part]()}
                {isCesPart(row.part) && <CesTag />}
              </span>
              <span className="phone-row-word">{row.word}</span>
            </li>
          ))}
        </ul>
        <p className="hint">{t('Codul merge {hours} de ore. Îl faci din nou la Pregătire: „Fă poze cu telefonul”.', { hours: PHONE_LINK_HOURS })}</p>
        <div className="qr-window-actions">
          <button type="button" className={allThere ? 'button' : 'button-quiet'} onClick={onClose}>
            {allThere ? t('Gata') : t('Închide')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
