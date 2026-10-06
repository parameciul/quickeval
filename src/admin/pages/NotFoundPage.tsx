import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section>
      <h1>Pagina nu există</h1>
      <p>
        <Link to="/clase">Mergi la clase</Link>
      </p>
    </section>
  );
}
