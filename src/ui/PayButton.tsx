import { useEffect, useState } from 'react';
import { isStripeCheckoutUrl, paymentReturnOf } from '../../shared/payments.ts';
import { GENERIC_MESSAGE, messageOf } from './ApiError.ts';

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

  // Back from the payment page, the browser may show this page from its
  // cache, with the button still busy.
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(false);
    };
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const url = await startCheckout();
      if (!isStripeCheckoutUrl(url)) throw new Error(GENERIC_MESSAGE);
      goTo(url);
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

// The line a page shows after the payment page sent the user back. Coming
// back proves nothing: a paid feature opens when Stripe's webhook arrives.
export function PaymentReturnNotice({ search = window.location.search }: { search?: string }) {
  const outcome = paymentReturnOf(search);
  if (outcome === null) return null;
  return (
    <p className="alert-text" role="status">
      {outcome === 'reusita' ? 'Plata se verifică. Funcția se deschide după confirmare.' : 'Plata a fost anulată. Nu ai plătit nimic.'}
    </p>
  );
}
