import { describe, expect, it } from 'vitest';
import { checkoutBody, isReturnPath, paymentReturnOf, returnUrl } from './payments.ts';

describe('isReturnPath', () => {
  it('takes paths of the teacher app for teachers and of the student app for students', () => {
    expect(isReturnPath('/admin/teste/6E2-26T1', 'teacher')).toBe(true);
    expect(isReturnPath('/admin/setari?tab=1', 'teacher')).toBe(true);
    expect(isReturnPath('/u/abcdefghijkmnop2', 'student')).toBe(true);
    expect(isReturnPath('/u/abcdefghijkmnop2', 'teacher')).toBe(false);
    expect(isReturnPath('/admin/', 'student')).toBe(false);
  });

  it('refuses other sites and odd paths', () => {
    for (const path of ['https://evil.test/admin/', '//evil.test/admin/', '/admin//evil.test', '/admin\\x', 'admin/', '/admin/<x>', `/admin/${'a'.repeat(300)}`]) {
      expect(isReturnPath(path, 'teacher')).toBe(false);
    }
  });
});

describe('returnUrl', () => {
  it('adds the outcome, and the Stripe session placeholder on success', () => {
    expect(returnUrl('https://q.test', '/admin/setari', 'reusita')).toBe(
      'https://q.test/admin/setari?plata=reusita&session_id={CHECKOUT_SESSION_ID}',
    );
    expect(returnUrl('https://q.test', '/admin/teste?clasa=3', 'anulata')).toBe('https://q.test/admin/teste?clasa=3&plata=anulata');
  });
});

describe('paymentReturnOf', () => {
  it('reads the outcome, and nothing else', () => {
    expect(paymentReturnOf('?plata=reusita&session_id=cs_1')).toBe('reusita');
    expect(paymentReturnOf('?plata=anulata')).toBe('anulata');
    expect(paymentReturnOf('?plata=alt')).toBeNull();
    expect(paymentReturnOf('')).toBeNull();
  });
});

describe('checkoutBody', () => {
  it('takes a feature key and refuses an amount-shaped or odd one', () => {
    expect(checkoutBody.safeParse({ feature: 'class_report', returnPath: '/admin/' }).success).toBe(true);
    expect(checkoutBody.safeParse({ feature: 'Class Report', returnPath: '/admin/' }).success).toBe(false);
    expect(checkoutBody.safeParse({ feature: '__proto__', returnPath: '/admin/' }).success).toBe(false);
    expect(checkoutBody.safeParse({ feature: 'x', returnPath: '' }).success).toBe(false);
  });
});
