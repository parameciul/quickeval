// The mark of a CES student ("cerințe educaționale speciale") next to the
// name, in every teacher table that lists students. For the teacher only: no
// student page shows it.
import { t } from '../i18n/t.ts';
export function CesTag() {
  return (
    <span className="tag tag-ces" title={t('Cerințe educaționale speciale')}>
      CES
    </span>
  );
}
