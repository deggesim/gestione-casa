import { useEffect, useState } from 'react';

// Replaces the legacy ngx-device-detector (isDesktop/isTablet) with the Bootstrap
// breakpoints the rest of the layout already uses.
export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
};
