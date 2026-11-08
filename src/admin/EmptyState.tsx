import type { ReactNode } from 'react';

// An empty place of the teacher app (redesign spec §11.9): an icon, a heading,
// one sentence, and at most one button, its one next step. The heading's
// level fits the place: under a panel's or a card's title it is an h3, on a
// page with no other heading an h1.
export function EmptyState({
  icon,
  title,
  level = 3,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  level?: 1 | 2 | 3;
  action?: ReactNode;
  children: ReactNode;
}) {
  const Heading = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
  return (
    <div className="empty-state">
      <span className="empty-state-icon">{icon}</span>
      <Heading>{title}</Heading>
      <p>{children}</p>
      {action}
    </div>
  );
}
