import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkoutParams, createCheckoutSession, formEncode, STRIPE_API_VERSION, stripeSignatureHeader, verifyStripeSignature } from './stripe.ts';

const SECRET = 'whsec_test_secret';
const NOW = 1_800_000_000;
const BODY = '{"type":"checkout.session.completed"}';

describe('verifyStripeSignature', () => {
  it('accepts the signature Stripe makes for the exact body', async () => {
    const header = await stripeSignatureHeader(BODY, SECRET, NOW);
    expect(await verifyStripeSignature(BODY, header, SECRET, NOW)).toBe(true);
  });

  it('refuses a changed body, another secret, and no header', async () => {
    const header = await stripeSignatureHeader(BODY, SECRET, NOW);
    expect(await verifyStripeSignature(`${BODY} `, header, SECRET, NOW)).toBe(false);
    expect(await verifyStripeSignature(BODY, header, 'whsec_other', NOW)).toBe(false);
    expect(await verifyStripeSignature(BODY, undefined, SECRET, NOW)).toBe(false);
  });

  it('refuses a signature older or newer than five minutes', async () => {
    const header = await stripeSignatureHeader(BODY, SECRET, NOW - 301);
    expect(await verifyStripeSignature(BODY, header, SECRET, NOW)).toBe(false);
    const future = await stripeSignatureHeader(BODY, SECRET, NOW + 301);
    expect(await verifyStripeSignature(BODY, future, SECRET, NOW)).toBe(false);
    const recent = await stripeSignatureHeader(BODY, SECRET, NOW - 299);
    expect(await verifyStripeSignature(BODY, recent, SECRET, NOW)).toBe(true);
  });

  it('accepts any of several v1 signatures, as during a secret change', async () => {
    const good = (await stripeSignatureHeader(BODY, SECRET, NOW)).split('v1=')[1];
    expect(await verifyStripeSignature(BODY, `t=${NOW},v1=${'0'.repeat(64)},v1=${good}`, SECRET, NOW)).toBe(true);
  });

  it('reads spaces and upper-case hex, and refuses a second time', async () => {
    const good = (await stripeSignatureHeader(BODY, SECRET, NOW)).split('v1=')[1]!;
    expect(await verifyStripeSignature(BODY, `t=${NOW}, v1=${good.toUpperCase()}`, SECRET, NOW)).toBe(true);
    expect(await verifyStripeSignature(BODY, `t=${NOW},t=${NOW},v1=${good}`, SECRET, NOW)).toBe(false);
  });

  it('signs the exact bytes, with the same answer for text and bytes', async () => {
    const bytes = new TextEncoder().encode('{"name":"Ștefan"}');
    const header = await stripeSignatureHeader('{"name":"Ștefan"}', SECRET, NOW);
    expect(await verifyStripeSignature(bytes, header, SECRET, NOW)).toBe(true);
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...bytes]);
    expect(await verifyStripeSignature(bom, header, SECRET, NOW)).toBe(false);
  });

  it('refuses a header with no time or no v1', async () => {
    const good = (await stripeSignatureHeader(BODY, SECRET, NOW)).split('v1=')[1];
    expect(await verifyStripeSignature(BODY, `v1=${good}`, SECRET, NOW)).toBe(false);
    expect(await verifyStripeSignature(BODY, `t=${NOW}`, SECRET, NOW)).toBe(false);
    expect(await verifyStripeSignature(BODY, `t=abc,v1=${good}`, SECRET, NOW)).toBe(false);
  });
});

describe('checkout form', () => {
  it('sends one line with the price and the payment id, in bracket keys', () => {
    const form = formEncode(
      checkoutParams({
        paymentId: 7,
        idempotencyKey: 'k',
        name: 'Raport ă',
        amount: 1500,
        currency: 'ron',
        expiresAtS: 1_800_003_600,
        successUrl: 'https://x.test/admin/?plata=reusita&session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://x.test/admin/?plata=anulata',
      }),
    );
    const params = new URLSearchParams(form);
    expect(params.get('mode')).toBe('payment');
    expect(params.get('client_reference_id')).toBe('7');
    expect(params.get('metadata[payment_id]')).toBe('7');
    expect(params.get('line_items[0][price_data][unit_amount]')).toBe('1500');
    expect(params.get('line_items[0][price_data][currency]')).toBe('ron');
    expect(params.get('line_items[0][price_data][product_data][name]')).toBe('Raport ă');
    expect(params.get('success_url')).toContain('{CHECKOUT_SESSION_ID}');
  });
});

describe('createCheckoutSession', () => {
  const input = {
    paymentId: 3,
    idempotencyKey: 'payment-3-2026',
    name: 'Cont Pro',
    amount: 4900,
    currency: 'ron',
    expiresAtS: 1_800_003_600,
    successUrl: 'https://q.test/admin/?plata=reusita',
    cancelUrl: 'https://q.test/admin/?plata=anulata',
  };
  const answer = (status: number, body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the form to Stripe with the key and the idempotency key', async () => {
    const fetchMock = answer(200, { id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1' });
    vi.stubGlobal('fetch', fetchMock);
    expect(await createCheckoutSession('sk_test_1', input)).toEqual({ id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer sk_test_1',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': 'payment-3-2026',
      'Stripe-Version': STRIPE_API_VERSION,
    });
    expect(new URLSearchParams(String(init.body)).get('expires_at')).toBe('1800003600');
    expect(new URLSearchParams(String(init.body)).get('line_items[0][price_data][unit_amount]')).toBe('4900');
  });

  it('throws when Stripe refuses, or answers without a page', async () => {
    vi.stubGlobal('fetch', answer(400, { error: { message: 'Invalid currency' } }));
    await expect(createCheckoutSession('sk_test_1', input)).rejects.toThrow(/400.*Invalid currency/);
    vi.stubGlobal('fetch', answer(200, { id: 'cs_1' }));
    await expect(createCheckoutSession('sk_test_1', input)).rejects.toThrow(/Stripe refused/);
  });
});
