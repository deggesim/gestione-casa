export type Crumb = { label: string; to?: string };

// The statistiche routes are flat siblings rather than a nested tree (see router.tsx), so
// a match cannot inherit its parent's crumb the way the legacy ActivatedRoute walk did.
// Each route therefore declares its whole chain, and this only flattens what matched.
export const crumbsFromMatches = (matches: { staticData?: { crumbs?: Crumb[] } }[]): Crumb[] =>
  matches.flatMap((match) => match.staticData?.crumbs ?? []);
