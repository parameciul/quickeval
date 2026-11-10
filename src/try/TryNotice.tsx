// The two ends of a try's link: a link that is not a try's, and a try whose
// 7 days are over (spec §3.3, state 6). Both lead to a new try from the
// landing page.
export function BadLink() {
  return (
    <section className="try-notice">
      <h1>Linkul nu este bun</h1>
      <p>Verifică dacă l-ai copiat întreg.</p>
      <a className="button" href="/">
        Mergi la pagina principală
      </a>
    </section>
  );
}

export function Expired() {
  return (
    <section className="try-notice">
      <h1>Încercarea a expirat</h1>
      <p>Linkul unei încercări rapide merge 7 zile. Poți face o încercare nouă de pe pagina principală.</p>
      <a className="button" href="/">
        Fă o încercare nouă
      </a>
    </section>
  );
}
