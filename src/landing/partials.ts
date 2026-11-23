// i18n-ignore-file: the footer has a copy per language, checked by src/landing/pages.test.ts.
// Parts of the public pages that are the same on every page. A page names one
// with a comment, `<!--#include site-foot -->`, and Vite puts the part in its
// place (the `publicPagePartials` plugin in vite.config.ts), in dev and in the
// build. Tests that read a page's raw HTML expand it first with expandPartials.

const MARK =
  '<svg class="mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g fill="none" stroke-width="7"><path d="M35.74 14.39A18 18 0 0 1 49.12 37.56" stroke="var(--mk-a)" /><path d="M45.38 44.04A18 18 0 0 1 18.62 44.04" stroke="var(--mk-a)" /><path d="M14.88 37.56A18 18 0 0 1 28.26 14.39" stroke="var(--mk-b)" /></g></svg>';

// The footer: the lockup, the content pages, the contact address and the
// line under them. It sits on the colour of the page's end band, right above it.
const SITE_FOOT = `<footer class="site-foot">
        <div class="foot wrap">
          <a class="brand" href="/" aria-label="MQGrader by Laura Miron">
            ${MARK}
            <span class="words"><b>MQGrader</b><span>by Laura Miron</span></span>
          </a>
          <nav class="foot-nav" aria-label="Pagini">
            <a href="/guide/">Ghidul aplicației</a>
            <a href="/grading/">Corectarea</a>
            <a href="/questions/">Întrebări</a>
            <a href="/about/">Despre</a>
            <a href="/pricing/">Cât costă</a>
          </nav>
          <a class="link" href="mailto:contact@mqgrader.ro">contact@mqgrader.ro</a>
          <span class="note">Corectarea testelor după barem · Timișoara · 2026</span>
        </div>
      </footer>`;

// The same footer on the English pages (/en/…).
const SITE_FOOT_EN = `<footer class="site-foot">
        <div class="foot wrap">
          <a class="brand" href="/en/" aria-label="MQGrader by Laura Miron">
            ${MARK}
            <span class="words"><b>MQGrader</b><span>by Laura Miron</span></span>
          </a>
          <nav class="foot-nav" aria-label="Pages">
            <a href="/en/guide/">App guide</a>
            <a href="/en/grading/">Grading</a>
            <a href="/en/questions/">Questions</a>
            <a href="/en/about/">About</a>
            <a href="/en/pricing/">Pricing</a>
          </nav>
          <a class="link" href="mailto:contact@mqgrader.ro">contact@mqgrader.ro</a>
          <span class="note">Grading tests by the marking scheme · Timișoara · 2026</span>
        </div>
      </footer>`;


// The teachers' questions, one item each. The landing page shows its own
// (FAQ_LIST); /questions/ shows those and the grading page's, in the order of a
// test's stages, with the account last (QUESTIONS_LIST). The grading page keeps
// its questions in its own HTML, next to their FAQPage data; a test checks that
// GRADING_QA says them word for word.
const QA: Readonly<Record<string, string>> = {
  what: `<li class="rise"><h3>Ce este MQGrader?</h3><p>O platformă web pentru profesori. Corectează teste de matematică, fizică, chimie, biologie, științe, limba română și limba engleză. Elevii trimit pozele lucrărilor de pe telefon, iar fiecare lucrare primește punctaj pas cu pas, conform baremului.</p></li>`,
  ai: `<li class="rise"><h3>Folosește inteligență artificială (AI)?</h3><p>Da. AI citește pozele lucrărilor și propune punctajul pas cu pas, după baremul tău. AI nu decide singur: punctele nesigure te așteaptă la verificare, iar nota finală este a ta.</p></li>`,
  studentAccount: `<li class="rise"><h3>Au elevii nevoie de cont sau de aplicație?</h3><p>Nu. Scanează codul QR de pe test și trimit pozele de pe telefon. Fără cont, fără aplicație, fără email.</p></li>`,
  noPhone: `<li class="rise"><h3>Ce se întâmplă dacă un elev nu are telefon sau nu apucă să trimită pozele?</h3><p>Încarci tu lucrarea lui, cu linkul tău pentru mai multe lucrări: de pe același telefon se trimit lucrările mai multor elevi. Dacă nu ajunge timpul în clasă, strângi foile și le încarci mai târziu, tot tu.</p></li>`,
  changePoints: `<li class="rise"><h3>Pot schimba eu punctajul?</h3><p>Da, oricând. Accepți sau schimbi punctajul oricărui exercițiu, mai ales în cazurile discutabile sau creative.</p></li>`,
  noBarem: `<li class="rise"><h3>Ce fac dacă nu am un barem pregătit?</h3><p>Generezi automat baremul din test, iar apoi îl poți revizui și ajusta. Nimic nu se corectează după un barem pe care nu l-ai confirmat.</p></li>`,
  phone: `<li class="rise"><h3>Merge de pe telefon?</h3><p>Da. Elevii trimit de pe telefon, iar tu poți verifica punctele nesigure și publica notele tot de pe telefon.</p></li>`,
  end: `<li class="rise"><h3>Ce primesc la sfârșit profesorul și elevii?</h3><p>Fiecare elev primește rezultatul lui: nota, punctele pe fiecare exercițiu, explicații și o sinteză cu ce merge bine și recomandări. Tu primești raportul clasei, detaliat pe puncte, cu recomandări și statistici — în aplicație și ca PDF.</p></li>`,
  account: `<li class="rise"><h3>Cum obțin un cont de profesor?</h3><p>Apeși „Cere un cont de profesor” și completezi formularul. Îți confirmi adresa de email, apoi contul este aprobat.</p></li>`,
};

const QA_EN: Readonly<Record<string, string>> = {
  what: `<li class="rise"><h3>What is MQGrader?</h3><p>A web platform for teachers. It grades tests in mathematics, physics, chemistry, biology, science, Romanian and English. Students send photos of their papers from their phones, and every paper is scored step by step, by the marking scheme.</p></li>`,
  ai: `<li class="rise"><h3>Does it use artificial intelligence (AI)?</h3><p>Yes. AI reads the photos of the papers and proposes the points step by step, by your marking scheme. AI does not decide alone: the unsure points wait for your review, and the final grade is yours.</p></li>`,
  studentAccount: `<li class="rise"><h3>Do students need an account or an app?</h3><p>No. They scan the QR code on the test and send the photos from their phone. No account, no app, no email.</p></li>`,
  noPhone: `<li class="rise"><h3>What if a student has no phone or no time to send the photos?</h3><p>You upload their paper yourself, with your link for several papers: from one phone you can send the papers of several students. If there is not enough time in class, you collect the sheets and upload them later yourself.</p></li>`,
  changePoints: `<li class="rise"><h3>Can I change the points myself?</h3><p>Yes, at any time. You accept or change the points of any exercise, above all in debatable or creative cases.</p></li>`,
  noBarem: `<li class="rise"><h3>What if I have no marking scheme ready?</h3><p>You make the marking scheme from the test automatically, and then you can review and adjust it. Nothing is graded by a marking scheme you have not confirmed.</p></li>`,
  phone: `<li class="rise"><h3>Does it work from a phone?</h3><p>Yes. Students send from their phones, and you can check the unsure points and publish the grades from your phone too.</p></li>`,
  end: `<li class="rise"><h3>What do the teacher and the students get at the end?</h3><p>Each student gets their result: the grade, the points for each exercise, explanations and a summary of what goes well, with advice. You get the class report, detailed point by point, with advice and statistics — in the app and as a PDF.</p></li>`,
  account: `<li class="rise"><h3>How do I get a teacher account?</h3><p>You press “Ask for a teacher account” and fill in the form. You confirm your email address, then the account is approved.</p></li>`,
};

const GRADING_QA: Readonly<Record<string, string>> = {
  finalPoints: `<li class="rise"><h3>Cine stabilește punctajul final?</h3><p>Profesorul. Punctajul propus urmează baremul, iar punctele nesigure te așteaptă la verificare: le accepți sau le schimbi. Decizia rămâne a ta.</p></li>`,
  otherMethod: `<li class="rise"><h3>Ce se întâmplă dacă un elev rezolvă altfel decât în barem?</h3><p>Exercițiul ajunge la tine ca punct de verificat, împreună cu motivul. Dacă rezolvarea este corectă, îi dai punctajul întreg, chiar dacă metoda nu este cea din barem.</p></li>`,
  unreadable: `<li class="rise"><h3>Ce se întâmplă dacă o poză nu se poate citi?</h3><p>Pagina ajunge la tine la verificare, împreună cu exercițiile care ar putea fi pe ea. Te uiți pe poză sau pe foaia elevului și decizi tu punctajul.</p></li>`,
  subjects: `<li class="rise"><h3>Ce materii poate corecta MQGrader?</h3><p>Matematică, fizică, chimie, biologie, științe, limba română și limba engleză. Testul poate avea grile, răspunsuri scurte, rezolvări pe etape sau compuneri.</p></li>`,
  ownBarem: `<li class="rise"><h3>Pot încărca un barem scris de mine?</h3><p>Da. Baremul încărcat de tine se folosește întocmai. Baremul generat este doar o variantă, pe care o revizuiești, o ajustezi sau o înlocuiești.</p></li>`,
  publish: `<li class="rise"><h3>Când e bine să public rezultatele?</h3><p>Cât mai repede, înainte de următorul test. Un elev care își așteaptă nota o săptămână nu mai învață nimic din ea, iar discuțiile despre testul vechi se adună peste cel nou.</p></li>`,
};

const GRADING_QA_EN: Readonly<Record<string, string>> = {
  finalPoints: `<li class="rise"><h3>Who sets the final points?</h3><p>The teacher. The proposed points follow the marking scheme, and the unsure points wait for your review: you accept or change them. The decision stays yours.</p></li>`,
  otherMethod: `<li class="rise"><h3>What happens if a student solves it differently from the marking scheme?</h3><p>The exercise comes to you as a point to check, with the reason. If the solution is right, you give it the full points, even if the method is not the one in the marking scheme.</p></li>`,
  unreadable: `<li class="rise"><h3>What happens if a photo cannot be read?</h3><p>The page comes to you for review, with the exercises that could be on it. You look at the photo or at the student's sheet and decide the points yourself.</p></li>`,
  subjects: `<li class="rise"><h3>Which subjects can MQGrader grade?</h3><p>Mathematics, physics, chemistry, biology, science, Romanian and English. The test can have multiple choice, short answers, solutions in steps or essays.</p></li>`,
  ownBarem: `<li class="rise"><h3>Can I upload a marking scheme I wrote?</h3><p>Yes. The marking scheme you upload is used exactly as it is. A generated marking scheme is only a draft, which you review, adjust or replace.</p></li>`,
  publish: `<li class="rise"><h3>When should I publish the results?</h3><p>As soon as possible, before the next test. A student who waits a week for their grade learns nothing more from it, and the talk about the old test piles up on the new one.</p></li>`,
};

const LANDING_ORDER = ['what', 'ai', 'studentAccount', 'noPhone', 'changePoints', 'noBarem', 'phone', 'end', 'account'];
const QUESTIONS_ORDER = [
  'what', 'ai', 'subjects', // what it is
  'noBarem', 'ownBarem', // preparation: the barem
  'studentAccount', 'noPhone', 'phone', // in class: sending the papers
  'otherMethod', 'unreadable', // grading
  'finalPoints', 'changePoints', // review
  'end', 'publish', // results
  'account',
];

function list(order: readonly string[], ...sources: Readonly<Record<string, string>>[]): string {
  const item = (key: string) => {
    const li = sources.map((source) => source[key]).find((found) => found !== undefined);
    if (li === undefined) throw new Error(`Unknown question: ${key}`);
    return li;
  };
  return `<ul class="qa">\n${order.map((key) => `  ${item(key)}`).join('\n')}\n</ul>`;
}

const FAQ_LIST = list(LANDING_ORDER, QA);
const FAQ_LIST_EN = list(LANDING_ORDER, QA_EN);
const QUESTIONS_LIST = list(QUESTIONS_ORDER, QA, GRADING_QA);
const QUESTIONS_LIST_EN = list(QUESTIONS_ORDER, QA_EN, GRADING_QA_EN);

export const PARTIALS: Readonly<Record<string, string>> = {
  'site-foot': SITE_FOOT,
  'site-foot-en': SITE_FOOT_EN,
  'faq-list': FAQ_LIST,
  'faq-list-en': FAQ_LIST_EN,
  'questions-list': QUESTIONS_LIST,
  'questions-list-en': QUESTIONS_LIST_EN,
};

const INCLUDE = /<!--#include ([a-z-]+) -->/g;

// The page with every include replaced by its part. An unknown name fails the
// build instead of leaving a hole in the page.
export function expandPartials(html: string): string {
  return html.replace(INCLUDE, (_, name: string) => {
    const part = PARTIALS[name];
    if (part === undefined) throw new Error(`Unknown partial: ${name}`);
    return part;
  });
}
