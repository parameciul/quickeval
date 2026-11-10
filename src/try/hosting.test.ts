import { describe, expect, it } from 'vitest';
import headers from '../../public/_headers?raw';
import redirects from '../../public/_redirects?raw';
import page from '../../try/index.html?raw';

// A Quick Try's page (/try/<token>) is private like a student link: never
// indexed, and every address under /try/ loads the same page.
describe("a Quick Try's page on Pages", () => {
  it('loads try/index.html for every /try/<token>, in the directory form', () => {
    expect(redirects.split('\n')).toContain('/try/* /try/ 200');
  });

  it('is never indexed', () => {
    expect(headers).toMatch(/^\/try\/\*\n {2}X-Robots-Tag: noindex, nofollow$/m);
    expect(page).toContain('<meta name="robots" content="noindex, nofollow" />');
  });

  it('runs its own script and says what it is', () => {
    expect(page).toContain('<script type="module" src="/src/try/main.tsx"></script>');
    expect(page).toContain('<title>MQGrader · Încercare rapidă</title>');
  });
});
