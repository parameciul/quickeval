import { QRCodeSVG } from 'qrcode.react';
import { quickTryPhonePath } from '../../shared/quickTry.ts';
import { t } from '../i18n/t.ts';

// The QR code of the try's phone page, under the pages of "Lucrarea elevului".
// Its ground stays white in the dark theme too, so a phone reads it.
export function PhoneCode({ id, token }: { id?: string; token: string }) {
  return (
    <div className="phone-code" id={id}>
      <QRCodeSVG value={window.location.origin + quickTryPhonePath(token)} size={150} level="M" marginSize={2} title={t('Cod QR pentru telefon')} className="phone-qr" />
      <div>
        <p className="phone-code-lead">{t('Scanează codul cu camera telefonului')}</p>
        <p className="hint">{t('Paginile apar în lista de mai sus imediat ce le trimiți. Pornește corectarea după ce au ajuns toate paginile. Codul merge doar pentru această încercare.')}</p>
      </div>
    </div>
  );
}
