/**
 * What `/news` keeps in its URL: the category chip (`?category=transferts`)
 * and the club filter (`?club=<teamId>`).
 *
 * They used to be page state. An article is rendered by the same route in
 * place of the hub, which unmounts the page, so every article read wiped the
 * filters and Retour came back to the unfiltered feed. In the URL they are
 * part of the history entry: Retour, forward, a reload and a shared link all
 * open the same feed. Nothing here is a default, so a clean `/news` stays
 * clean: no filter means no key.
 */
export interface NewsSearch {
  readonly category?: string;
  readonly club?: string;
}

/** A slug or an id, and nothing a URL could use to smuggle markup or a path. */
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

/**
 * The router JSON-parses a query value before validation, so an id that
 * happens to be a number arrives as one. Read it back as its text.
 */
function keyOf(value: unknown): string | undefined {
  const text =
    typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined;
  return text !== undefined && SAFE_KEY.test(text) ? text : undefined;
}

export function validateNewsSearch(search: Record<string, unknown>): NewsSearch {
  const category = keyOf(search.category);
  const club = keyOf(search.club);
  return {
    ...(category ? { category } : {}),
    ...(club ? { club } : {}),
  };
}

/** The search for a change of filter: only what is set, so defaults stay out of the URL. */
export function newsSearchFrom(filters: {
  categorySlug: string | null;
  clubId: string | null;
}): NewsSearch {
  return {
    ...(filters.categorySlug ? { category: filters.categorySlug } : {}),
    ...(filters.clubId ? { club: filters.clubId } : {}),
  };
}
