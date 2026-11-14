import { useMutation } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useId, useRef, useState } from 'react';
import type { TestInfo } from '../../../shared/api.ts';
import { countLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { CopyRefused, useCopyLink } from '../CopyLink.tsx';
import { EmptyState } from '../EmptyState.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { IconClock, IconDone } from '../shell/icons.tsx';
import { MoveOnLink } from './MoveOnLink.tsx';
import { QrDownload, QrOverlay, uploadLink } from './UploadLink.tsx';

// Whether a test has results to publish or to stop: something is graded, or
// results are already open (for all, or for single uploads). Before that the
// teacher has nothing to decide, so the panel shows no button.
export function hasResultsToManage(test: Pick<TestInfo, 'status' | 'gradedCount' | 'resultsOpen' | 'publishedCount'>): boolean {
  return test.status !== 'draft' && (test.gradedCount > 0 || test.resultsOpen || test.publishedCount > 0);
}

// Whether students can read results now: open for all, or some published alone.
export function hasPublishedResults(test: Pick<TestInfo, 'resultsOpen' | 'publishedCount'>): boolean {
  return test.resultsOpen || test.publishedCount > 0;
}

// Rezultate before there is anything to publish (redesign spec §11.9): its
// one next step is the stage Corectare.
export function NoResultsYet() {
  return (
    <EmptyState
      icon={<IconClock />}
      title="Rezultatele se publică după corectare"
      action={
        <MoveOnLink stage="Corectare" className="button-quiet button-small">
          Mergi la Corectare
        </MoveOnLink>
      }
    >
      Când lucrările sunt corectate, le publici de aici; fiecare elev primește linkul lui, cu explicații detaliate pentru fiecare problemă și o sinteză finală cu ce merge bine și recomandări.
    </EmptyState>
  );
}

// The box at the top of Rezultate (spec 2026-11-14, design C3): publishing
// and stopping the results of every student at once, and, once students can
// read results, the two ways they find them. Closing also takes back the
// results published alone (the API does it), so it closes every link.
export function ResultsAccess({ test, onChanged }: { test: TestInfo; onChanged: () => Promise<void> }) {
  const api = useApi();
  const headingId = useId();
  const toggle = useMutation({
    mutationFn: () => api.setResultsOpen(test.code, !test.resultsOpen),
    onSuccess: onChanged,
  });
  if (!hasResultsToManage(test)) return <NoResultsYet />;

  const button = test.resultsOpen ? (
    <button type="button" className="button-quiet button-small" disabled={toggle.isPending} onClick={() => toggle.mutate()}>
      Oprește accesul la rezultate
    </button>
  ) : (
    <button type="button" className="button button-small" disabled={toggle.isPending} onClick={() => toggle.mutate()}>
      Publică toate rezultatele
    </button>
  );
  // Points still to check, said before the teacher publishes them all.
  const waiting =
    !test.resultsOpen && test.flagCount > 0 ? (
      <p className="publish-wait">
        Mai ai {countLabel(test.flagCount, 'punct de verificat', 'puncte de verificat')}. Dacă publici acum, elevii văd punctajul de acum.
      </p>
    ) : null;

  if (!hasPublishedResults(test)) {
    return (
      <section className="publish-box" aria-labelledby={headingId}>
        <div className="publish-head">
          <h3 id={headingId}>Rezultatele nu sunt publicate</h3>
          {button}
        </div>
        {waiting ?? <p className="hint">Elevii nu văd încă rezultatele.</p>}
        {toggle.error && <ErrorMessage error={toggle.error} />}
      </section>
    );
  }
  return (
    <section className="publish-box is-published" aria-labelledby={headingId}>
      <div className="publish-head">
        <span className="publish-check" aria-hidden="true">
          <IconDone />
        </span>
        <h3 id={headingId}>
          {test.resultsOpen ? 'Rezultatele sunt publicate.' : 'Unele rezultate sunt publicate.'} Elevii le văd în două feluri:
        </h3>
        {button}
      </div>
      {waiting}
      {test.resultsOpen && (
        <p className="hint publish-stop-hint">Dacă oprești accesul, linkurile cu rezultate și pozele lor nu se mai deschid până publici din nou rezultatele.</p>
      )}
      <ol className="publish-ways" role="list">
        <li>
          <p className="publish-way-title">Pe linkul lor</p>
          <p className="hint">Salvat pe telefon la încărcarea rezolvărilor. Nu trebuie să facă nimic.</p>
        </li>
        <li>
          <p className="publish-way-title">Scanează din nou linkul testului pentru elevi</p>
          <p className="hint">Codul QR de pe test, de pe telefonul cu care au trimis.</p>
          {test.uploadToken !== null && <StudentLink code={test.code} token={test.uploadToken} />}
        </li>
      </ol>
      {toggle.error && <ErrorMessage error={toggle.error} />}
    </section>
  );
}

// The test's link for the students, in the box: copy it, save its QR code as
// a PNG file, or show it on the whole screen. When the browser refuses to
// copy, the link shows in a field, selected, to copy by hand.
function StudentLink({ code, token }: { code: string; token: string }) {
  const url = uploadLink(token);
  const { copied, refused, copy, field } = useCopyLink();
  const [fullScreen, setFullScreen] = useState(false);
  const showButton = useRef<HTMLButtonElement>(null);
  return (
    <div className="publish-link">
      <QRCodeSVG value={url} size={88} marginSize={2} title="Codul QR al linkului" className="publish-qr" />
      <div className="publish-link-actions">
        <button type="button" className="button-quiet button-small" onClick={() => copy(url)}>
          {copied ? 'Copiat!' : 'Copiază linkul'}
        </button>
        <QrDownload url={url} fileName={`cod-qr-elevi-${code}.png`} />
        <button ref={showButton} type="button" className="button-quiet button-small" onClick={() => setFullScreen(true)}>
          Arată codul QR pe tot ecranul
        </button>
      </div>
      {refused && <CopyRefused field={field} url={url} label="Linkul testului pentru elevi" />}
      {fullScreen && (
        <QrOverlay
          url={url}
          onClose={() => {
            setFullScreen(false);
            showButton.current?.focus();
          }}
        />
      )}
    </div>
  );
}
