import { useMutation } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// /confirma-email#<token>: the link from the email of a new account. Shown
// without a login. It confirms only on the button: mail programs open links
// to check them, and that must not confirm an address for its owner.
export function ConfirmEmailPage() {
  const api = useApi();
  const token = useLocation().hash.replace(/^#/, '');
  const confirm = useMutation({ mutationFn: () => api.confirmEmail(token) });

  return (
    <section className="login-box">
      <h1>Confirmă adresa de email</h1>
      {confirm.isSuccess ? (
        <div className="warning" role="status">
          <p>Gata: adresa ta este confirmată.</p>
          <p>Acum un administrator trebuie să aprobe contul. Vei primi un email după aprobare.</p>
        </div>
      ) : token === '' ? (
        <p>Linkul nu este întreg. Deschide-l din nou din email.</p>
      ) : (
        <>
          <p>Ai cerut un cont în QuickEval. Apasă butonul ca să confirmi că adresa de email este a ta.</p>
          <span>
            <button type="button" className="button" disabled={confirm.isPending} onClick={() => confirm.mutate()}>
              {confirm.isPending ? 'Se confirmă…' : 'Confirmă adresa'}
            </button>
          </span>
          {confirm.error && <ErrorMessage error={confirm.error} />}
        </>
      )}
      <p className="hint">
        <Link to="/">Înapoi la pagina de intrare</Link>
      </p>
    </section>
  );
}
