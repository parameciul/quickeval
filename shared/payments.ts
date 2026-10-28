import { z } from 'zod';

// Paid features (Stripe Checkout). The server reads the price only from this
// catalog: the browser names a feature, never an amount.

// Who pays: the logged-in teacher, or a student through the test link.
export type Payer = 'teacher' | 'student';

// What one payment buys: the feature for the payer's whole account, or for one test.
export type PaymentScope = 'account' | 'test';

// A student feature always has scope "test": students have no login, so
// anyone with the link can pick a student's name.
export interface PaidFeature {
  // Romanian name, shown on the Stripe payment page.
  name: string;
  // In the smallest unit of the currency (bani for RON). Stripe needs at least 2 RON.
  amount: number;
  currency: 'ron' | 'eur';
  payer: Payer;
  scope: PaymentScope;
}

export type PaidFeatures = Readonly<Record<string, PaidFeature>>;

// The features on sale. Empty until the first paid feature is decided, for example:
//   class_report_pdf: { name: 'Raportul clasei în PDF', amount: 1500, currency: 'ron', payer: 'teacher', scope: 'test' },
export const PAID_FEATURES: PaidFeatures = {};

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'expired';

// One of the payer's payments, as the API shows it.
export interface PaymentRow {
  id: number;
  feature: string;
  // The test code, for a feature bought for one test.
  testCode: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  createdAt: string;
  paidAt: string | null;
}

// Only Stripe's own payment pages: the browser follows nothing else.
export function isStripeCheckoutUrl(url: string): boolean {
  return url.startsWith('https://checkout.stripe.com/');
}

export interface CheckoutAnswer {
  // The Stripe payment page. The browser goes there.
  url: string;
}

// The query parameter the payment page adds to the return address.
export const PAYMENT_RETURN_PARAM = 'plata';
export type PaymentReturn = 'reusita' | 'anulata';

export const FEATURE_KEY = /^[a-z][a-z0-9_]{0,39}$/;

// The page to come back to after paying: a path of our own apps, never another site.
export function isReturnPath(path: string, payer: Payer): boolean {
  if (path.length > 300 || path.includes('//') || path.includes('\\')) return false;
  if (!/^\/[A-Za-z0-9\-._~/?=&%]*$/.test(path)) return false;
  // No dot segments and no encoded dots, slashes or backslashes: the path
  // must stay in the payer's own app.
  if (/%(2e|2f|5c)/i.test(path) || /\/\.{1,2}(\/|\?|$)/.test(path)) return false;
  return payer === 'teacher' ? path.startsWith('/admin/') : path.startsWith('/u/');
}

// The return address for one outcome. `{CHECKOUT_SESSION_ID}` is filled in by Stripe.
export function returnUrl(origin: string, path: string, outcome: PaymentReturn): string {
  const glue = path.includes('?') ? '&' : '?';
  const session = outcome === 'reusita' ? '&session_id={CHECKOUT_SESSION_ID}' : '';
  return `${origin}${path}${glue}${PAYMENT_RETURN_PARAM}=${outcome}${session}`;
}

// The outcome in a page address that the payment page sent back, if any.
export function paymentReturnOf(search: string): PaymentReturn | null {
  const value = new URLSearchParams(search).get(PAYMENT_RETURN_PARAM);
  return value === 'reusita' || value === 'anulata' ? value : null;
}

export const checkoutBody = z.object({
  feature: z.string().regex(FEATURE_KEY, { message: 'Funcția aleasă nu există.' }),
  returnPath: z.string().min(1, { message: 'Pagina de întoarcere lipsește.' }),
  // The test the feature is for, when its scope is "test". Teachers only:
  // a student's test is the one of the link.
  testCode: z.string().max(40).optional(),
});

export type CheckoutInput = z.infer<typeof checkoutBody>;
