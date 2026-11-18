// The visit counter (Rybbit, docs/analytics.md). The public pages, the
// student pages and the Quick Try pages load its script from their HTML; the
// teacher app loads it here, only while the login screen shows.

export const STATS_SCRIPT = 'https://stats.mqgrader.ro/api/script.js?siteId=b5be2803e8ab';

// The teacher paths the counter skips (it sends nothing on them): every one but
// the login screen at /teacher/ and the sign-up at /teacher/#new-account. The
// links of the emails (confirm-email, new-password) hold a token after "#".
export const TEACHER_SKIP_PATTERNS = ['re:^/teacher/(?!$|#new-account$)'];

// The actions counted beside the visits. No name, email or token goes with them.
export type VisitEvent = 'account-request-sent' | 'quick-try-sent';

declare global {
  interface Window {
    rybbit?: { event(name: string, properties?: Record<string, unknown>): void };
  }
}

// Counts an action, when the page has the counter. A blocked or missing
// counter changes nothing for the visitor.
export function countVisitEvent(name: VisitEvent): void {
  try {
    window.rybbit?.event(name);
  } catch {
    // The count is lost; the page goes on.
  }
}

const TEACHER_SCRIPT_ID = 'visit-counter';

// The tab's reload, apart so the tests can watch it.
export const visitTab = { reload: () => window.location.reload() };

// Whether this tab loaded the counter for the login screen.
export function teacherCounterLoaded(doc: Document = document): boolean {
  return doc.getElementById(TEACHER_SCRIPT_ID) !== null;
}

// Loads the counter for the login screen, once per tab, and only in the built
// site (`enabled`): the development server and the tests count nothing.
export function loadTeacherCounter(doc: Document = document, enabled: boolean = import.meta.env.PROD): void {
  if (!enabled || teacherCounterLoaded(doc)) return;
  const script = doc.createElement('script');
  script.id = TEACHER_SCRIPT_ID;
  script.src = STATS_SCRIPT;
  script.defer = true;
  script.dataset.skipPatterns = JSON.stringify(TEACHER_SKIP_PATTERNS);
  doc.head.append(script);
}
