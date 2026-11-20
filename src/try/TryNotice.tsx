import { ApiError } from '../ui/ApiError.ts';
import { ActionIcon } from '../ui/ActionIcon.tsx';
import { t } from '../i18n/t.ts';

// An answer that says the try's 7 days are over (410 `expired`): every call
// of the link answers so once they are.
export function isExpired(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'expired';
}

// The two ends of a try's link: a link that is not a try's, and a try whose
// 7 days are over (spec §3.3, state 6). Both lead to a new try from the
// landing page.
export function BadLink() {
  return (
    <section className="try-notice">
      <h1>{t('Linkul nu este bun')}</h1>
      <p>{t('Verifică dacă l-ai copiat întreg. O încercare se șterge după 7 zile.')}</p>
      <a className="button" href="/">
        {t('Mergi la pagina principală')}
        <ActionIcon name="arrow" />
      </a>
    </section>
  );
}

export function Expired() {
  return (
    <section className="try-notice">
      <h1>{t('Încercarea a expirat')}</h1>
      <p>{t('Linkul unei încercări rapide merge 7 zile. Poți face o încercare nouă de pe pagina principală.')}</p>
      <a className="button" href="/">
        <ActionIcon name="add" />
        {t('Fă o încercare nouă')}
      </a>
    </section>
  );
}
