import { Link, useMatches } from '@tanstack/react-router';
import { crumbsFromMatches } from './breadcrumbs';

// Legacy parity: every entry carries breadcrumb-item active, the last one is plain text
// and the earlier ones are links.
export const Breadcrumb = () => {
  const crumbs = crumbsFromMatches(useMatches());
  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="breadcrumb">
      <ol className="breadcrumb bg-dark">
        {crumbs.map((crumb, i) => (
          <li className="breadcrumb-item active" key={crumb.label}>
            {i === crumbs.length - 1 || !crumb.to ? (
              <span>{crumb.label}</span>
            ) : (
              <Link to={crumb.to}>{crumb.label}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};
