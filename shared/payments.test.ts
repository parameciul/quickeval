import { describe, expect, it } from 'vitest';
import { checkoutBody, isReturnPath, isStripeCheckoutUrl, PAID_FEATURES, paymentReturnOf, returnUrl } from './payments.ts';

describe('isReturnPath', () => {
  it('takes paths of the teacher app for teachers and of the student app for students', () => {
    expect(isReturnPath('/teacher/tests/6E2-26T1', 'teacher')).toBe(true);
    expect(isReturnPath('/teacher/settings?tab=1', 'teacher')).toBe(true);
    expect(isReturnPath('/u/abcdefghijkmnop2', 'student')).toBe(true);
    expect(isReturnPath('/u/abcdefghijkmnop2', 'teacher')).toBe(false);
    expect(isReturnPath('/teacher/', 'student')).toBe(false);
  });

  it('refuses other sites and odd paths', () => {
    for (const path of ['https://evil.test/teacher/', '//evil.test/teacher/', '/teacher//evil.test', '/admin\\x', 'admin/', '/teacher/<x>', `/teacher/${'a'.repeat(300)}`, '/teacher/../u/x', '/teacher/./x', '/teacher/..', '/teacher/x/..?a=1', '/teacher/%2e%2e/u', '/teacher/%2F%2Fevil.test', '/teacher/x%5Cy', '/teacher/@evil', '/teacher/#x']) {
      expect(isReturnPath(path, 'teacher')).toBe(false);
    }
  });
});

describe('returnUrl', () => {
  it('adds the outcome, and the Stripe session placeholder on success', () => {
    expect(returnUrl('https://q.test', '/teacher/settings', 'success')).toBe(
      'https://q.test/teacher/settings?payment=success&session_id={CHECKOUT_SESSION_ID}',
    );
    expect(returnUrl('https://q.test', '/teacher/?class=3', 'cancelled')).toBe('https://q.test/teacher/?class=3&payment=cancelled');
  });
});

describe('paymentReturnOf', () => {
  it('reads the outcome, and nothing else', () => {
    expect(paymentReturnOf('?payment=success&session_id=cs_1')).toBe('success');
    expect(paymentReturnOf('?payment=cancelled')).toBe('cancelled');
    expect(paymentReturnOf('?payment=alt')).toBeNull();
  });

  it('reads the first name and values too, for a payment page open during the rename', () => {
    expect(paymentReturnOf('?plata=reusita&session_id=cs_1')).toBe('success');
    expect(paymentReturnOf('?plata=anulata')).toBe('cancelled');
    expect(paymentReturnOf('?plata=alt')).toBeNull();
    expect(paymentReturnOf('?plata=toString')).toBeNull();
    expect(paymentReturnOf('?payment=cancelled&plata=reusita')).toBe('cancelled');
    expect(paymentReturnOf('')).toBeNull();
  });
});

describe('checkoutBody', () => {
  it('takes a feature key and refuses an amount-shaped or odd one', () => {
    expect(checkoutBody.safeParse({ feature: 'class_report', returnPath: '/teacher/' }).success).toBe(true);
    expect(checkoutBody.safeParse({ feature: 'Class Report', returnPath: '/teacher/' }).success).toBe(false);
    expect(checkoutBody.safeParse({ feature: '__proto__', returnPath: '/teacher/' }).success).toBe(false);
    expect(checkoutBody.safeParse({ feature: 'x', returnPath: '' }).success).toBe(false);
  });
});

describe('isStripeCheckoutUrl', () => {
  it("takes Stripe's payment pages only", () => {
    expect(isStripeCheckoutUrl('https://checkout.stripe.com/c/pay/cs_test_1')).toBe(true);
    for (const url of ['http://checkout.stripe.com/c/1', 'https://checkout.stripe.com.evil.test/', 'https://evil.test/?https://checkout.stripe.com/', 'javascript:alert(1)']) {
      expect(isStripeCheckoutUrl(url)).toBe(false);
    }
  });
});

describe('PAID_FEATURES', () => {
  it('sells students features for one test only, at a price Stripe takes', () => {
    for (const [key, feature] of Object.entries(PAID_FEATURES)) {
      expect(key).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
      if (feature.payer === 'student') expect(feature.scope).toBe('test');
      expect(Number.isInteger(feature.amount) && feature.amount >= 200).toBe(true);
    }
  });
});
