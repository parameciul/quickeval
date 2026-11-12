import { Link } from 'react-router';

export interface Crumb {
  label: string;
  // The page of this step; the last step, the page itself, has none.
  to?: string;
}

// The path at the top of a page: "Teste › Clasa 7E2 › <test>", each step but
// the last a link. It replaces the old "← Toate testele" and the class tag.
export function Crumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="crumbs" aria-label="Unde ești">
      <ol>
        {items.map((item, index) => (
          <li key={`${index}:${item.label}`}>
            {item.to !== undefined ? <Link to={item.to}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
