import { constantTimeEqual } from '../secrets.ts';

// The small part of the Stripe API the app uses, over fetch: the stripe npm
// package is large for a Pages Function and needs Node's http.

const STRIPE_API = 'https://api.stripe.com/v1';

// The API version the app is written for. The webhook endpoint in the Stripe
// dashboard uses the same one, so events carry the same fields (docs/payments.md).
export const STRIPE_API_VERSION = '2025-03-31.basil';

// A signed event older than this is refused, so an old request cannot be sent again.
export const SIGNATURE_TOLERANCE_S = 300;

export interface CheckoutSessionInput {
  paymentId: number;
  // Sent as Stripe's Idempotency-Key: a retry makes no second page.
  idempotencyKey: string;
  name: string;
  amount: number;
  currency: string;
  // When Stripe closes the page, in Unix seconds.
  expiresAtS: number;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

export type CreateCheckoutSession = (secretKey: string, input: CheckoutSessionInput) => Promise<CheckoutSession>;

// Stripe's form encoding: nested keys in brackets, for example line_items[0][quantity].
export function formEncode(params: Record<string, string | number>): string {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

export function checkoutParams(input: CheckoutSessionInput): Record<string, string | number> {
  return {
    mode: 'payment',
    client_reference_id: String(input.paymentId),
    'metadata[payment_id]': String(input.paymentId),
    'line_items[0][quantity]': 1,
    'line_items[0][price_data][currency]': input.currency,
    'line_items[0][price_data][unit_amount]': input.amount,
    'line_items[0][price_data][product_data][name]': input.name,
    expires_at: input.expiresAtS,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  };
}

export const createCheckoutSession: CreateCheckoutSession = async (secretKey, input) => {
  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': input.idempotencyKey,
      'Stripe-Version': STRIPE_API_VERSION,
    },
    body: formEncode(checkoutParams(input)),
  });
  const body = (await res.json().catch(() => null)) as { id?: unknown; url?: unknown; error?: { message?: unknown } } | null;
  if (!res.ok || typeof body?.id !== 'string' || typeof body.url !== 'string') {
    throw new Error(`Stripe refused the payment page (${res.status}): ${String(body?.error?.message ?? '')}`);
  }
  return { id: body.id, url: body.url };
};

// The signed payload is "<t>.<body>", over the body's exact bytes.
async function signedHex(secret: string, timestamp: number, body: Uint8Array | string): Promise<string> {
  const encoder = new TextEncoder();
  const head = encoder.encode(`${timestamp}.`);
  const tail = typeof body === 'string' ? encoder.encode(body) : body;
  const payload = new Uint8Array(head.byteLength + tail.byteLength);
  payload.set(head);
  payload.set(tail, head.byteLength);
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, payload);
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// The Stripe-Signature header: "t=<unix seconds>,v1=<hex>[,v1=<hex>...]".
// The body must be the exact bytes Stripe sent, read before any JSON parse.
export async function verifyStripeSignature(
  body: Uint8Array | string,
  header: string | undefined,
  secret: string,
  nowS: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!header) return false;
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [name, value] = part.trim().split('=', 2);
    if (name === 't') {
      // One time only: a header with two could pair a fresh time with an old signature.
      if (timestamp !== null || value === undefined || !/^\d{1,12}$/.test(value)) return false;
      timestamp = Number(value);
    }
    if (name === 'v1' && value) signatures.push(value.toLowerCase());
  }
  if (timestamp === null || signatures.length === 0) return false;
  if (Math.abs(nowS - timestamp) > SIGNATURE_TOLERANCE_S) return false;
  const expected = await signedHex(secret, timestamp, body);
  return signatures.some((signature) => constantTimeEqual(signature, expected));
}

// The test helper's twin: a header Stripe would send for this body.
export async function stripeSignatureHeader(body: string, secret: string, timestampS: number): Promise<string> {
  return `t=${timestampS},v1=${await signedHex(secret, timestampS, body)}`;
}
