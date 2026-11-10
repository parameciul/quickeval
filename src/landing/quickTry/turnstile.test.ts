import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadTurnstile, TURNSTILE_SCRIPT } from './turnstile.ts';

afterEach(() => {
  delete window.turnstile;
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe("the form's Turnstile check", () => {
  it("loads Cloudflare's script once and draws the check in Romanian", async () => {
    const api = { render: vi.fn(() => 'w1'), getResponse: vi.fn(() => 'raspuns'), reset: vi.fn() };
    const box = document.body.appendChild(document.createElement('div'));
    const first = loadTurnstile(box, 'site-key');
    const scripts = document.head.querySelectorAll('script');
    expect(Array.from(scripts).map((tag) => tag.src)).toEqual([TURNSTILE_SCRIPT]);
    window.turnstile = api;
    scripts[0]!.dispatchEvent(new Event('load'));
    const widget = await first;
    expect(api.render).toHaveBeenCalledWith(box, { sitekey: 'site-key', language: 'ro' });
    expect(widget.token()).toBe('raspuns');
    widget.reset();
    expect(api.reset).toHaveBeenCalledWith('w1');
    await loadTurnstile(box, 'site-key');
    expect(document.head.querySelectorAll('script')).toHaveLength(1);
    expect(api.render).toHaveBeenCalledTimes(2);
  });
});
