import { useState } from 'react';
import { paymentReturnOf } from '../../shared/payments.ts';
import { messageOf } from './ApiError.ts';

// The pay button of any paid feature, in both apps. `startCheckout` asks the
// API for the Stripe payment page (useApi().startCheckout in the teacher app,
// the UploadApi's in the student app); the button then leaves for that page.
export function PayButton({
  label,
  startCheckout,
  goTo = (url) => window.location.assign(url),
}: {
  label: string;
  startCheckout: () => Promise<string>;
  goTo?: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      goTo(await startCheckout());
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="button-quiet button-small" disabled={busy} onClick={() => void pay()}>
        {busy ? 'Se deschide plata…' : label}
      </button>
      {error !== null && (
        <div className="alert" role="alert">
          <p className="alert-text">{messageOf(error)}</p>
        </div>
      )}
    </>
  );
}

// The line a page shows after the payment page sent the user back. A paid
// feature opens when Stripe's webhook arrives, which may take a few seconds.
export function PaymentReturnNotice({ search = window.location.search }: { search?: string }) {
  const outcome = paymentReturnOf(search);
  if (outcome === null) return null;
  return (
    <p className="alert-text" role="status">
      {outcome === 'reusita' ? 'Plata a fost primită. Funcția se deschide în câteva secunde.' : 'Plata a fost anulată. Nu ai plătit nimic.'}
    </p>
  );
}
