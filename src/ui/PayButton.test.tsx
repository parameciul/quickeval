import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoGradingWords } from '../test/gradingWords.ts';
import { ApiError } from './ApiError.ts';
import { PayButton, PaymentReturnNotice } from './PayButton.tsx';

describe('PayButton', () => {
  it('opens the payment page that the API gives', async () => {
    const goTo = vi.fn();
    const startCheckout = vi.fn(async () => 'https://checkout.stripe.com/c/1');
    render(<PayButton label="Plătește" startCheckout={startCheckout} goTo={goTo} />);
    await userEvent.click(screen.getByRole('button', { name: 'Plătește' }));
    expect(startCheckout).toHaveBeenCalledTimes(1);
    expect(goTo).toHaveBeenCalledWith('https://checkout.stripe.com/c/1');
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it("shows the API's Romanian message and lets the user try again", async () => {
    const goTo = vi.fn();
    const startCheckout = vi.fn().mockRejectedValueOnce(new ApiError(503, 'payments_off', 'Plățile nu sunt încă active.'));
    render(<PayButton label="Plătește" startCheckout={startCheckout} goTo={goTo} />);
    await userEvent.click(screen.getByRole('button', { name: 'Plătește' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Plățile nu sunt încă active.');
    expect(goTo).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Plătește' })).toBeEnabled();
  });

  it('shows a generic message for an error that is not from the API', async () => {
    render(<PayButton label="Plătește" startCheckout={() => Promise.reject(new Error('boom'))} goTo={vi.fn()} />);
    await userEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('alert')).toHaveTextContent('A apărut o eroare. Încearcă din nou.');
  });
});

describe('PayButton safety', () => {
  it('follows only a Stripe payment page', async () => {
    const goTo = vi.fn();
    render(<PayButton label="Plătește" startCheckout={async () => 'https://evil.test/pay'} goTo={goTo} />);
    await userEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('alert')).toHaveTextContent('A apărut o eroare. Încearcă din nou.');
    expect(goTo).not.toHaveBeenCalled();
  });

  it('is ready again when the browser shows the page from its cache', async () => {
    render(<PayButton label="Plătește" startCheckout={async () => 'https://checkout.stripe.com/c/1'} goTo={vi.fn()} />);
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toBeDisabled();
    const event = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(event, 'persisted', { value: true });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(screen.getByRole('button', { name: 'Plătește' })).toBeEnabled();
  });
});

describe('PaymentReturnNotice', () => {
  it('says what happened on the payment page, and nothing without it', () => {
    const { rerender } = render(<PaymentReturnNotice search="?plata=reusita&session_id=cs_1" />);
    expect(screen.getByRole('status')).toHaveTextContent('Plata se verifică.');
    expectNoGradingWords();
    rerender(<PaymentReturnNotice search="?plata=anulata" />);
    expect(screen.getByRole('status')).toHaveTextContent('Plata a fost anulată.');
    rerender(<PaymentReturnNotice search="" />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
