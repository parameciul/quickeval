import { Link } from 'react-router';
import { t } from '../../i18n/t.ts';

export function NotFoundPage() {
  return (
    <section>
      <h1>{t('Pagina nu există')}</h1>
      <p>
        <Link to="/">{t('Mergi la teste')}</Link>
      </p>
    </section>
  );
}
