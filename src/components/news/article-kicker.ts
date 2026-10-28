import type { TranslationKey } from "@/i18n/dictionaries";
import type { Article, Club } from "@/types/domain";
import type { ArticleFixture } from "./news-fixtures";

/**
 * The label a News card carries beside its time: the one thing about the
 * story that is worth a word.
 *
 * Every article on production is filed under the category `latest`, which the
 * dictionary calls "Dernières actualités": the label said nothing, on every
 * card, and ran out of the pill at 390px. A category only names a story when
 * it is a real section, so `latest` and `for_you` (which are "everything" and
 * "mine") never show. In order, the label is:
 *
 *   1. the editorial tag, when an editor gave the story one;
 *   2. "Avant-match" / "Résultat", when the story is tied to a fixture
 *      (`linkArticleToFixture`);
 *   3. the section, for Mercato, Analyses and Interviews;
 *   4. the club's name, for a story about exactly one club;
 *   5. nothing. No label is better than a generic one.
 */
export type ArticleKicker =
  | { readonly type: "tag" }
  | { readonly type: "fixture"; readonly key: "news.kicker.preview" | "news.kicker.result" }
  | { readonly type: "category" }
  | { readonly type: "club"; readonly club: Club };

/** Categories that mean "everything" or "mine", not a subject. */
const GENERIC_CATEGORIES: ReadonlySet<string> = new Set(["latest", "for_you"]);

/** The fixture label in the reader's language; each key a literal call so the i18n gate sees it. */
export function fixtureKickerLabel(
  key: "news.kicker.preview" | "news.kicker.result",
  t: (key: TranslationKey) => string,
): string {
  return key === "news.kicker.preview" ? t("news.kicker.preview") : t("news.kicker.result");
}

export function isGenericCategory(slug: string | undefined | null): boolean {
  return !slug || GENERIC_CATEGORIES.has(slug);
}

export function articleKicker(input: {
  readonly tag?: Article["tag"];
  readonly category?: string | null;
  /** The article's clubs, found in the directory, in the article's order. */
  readonly clubs: readonly Club[];
  /** How many clubs the article names, found or not: "the club" needs exactly one. */
  readonly clubCount: number;
  readonly fixture: ArticleFixture | null;
}): ArticleKicker | null {
  if (input.tag) return { type: "tag" };
  if (input.fixture?.kind === "preview") return { type: "fixture", key: "news.kicker.preview" };
  if (input.fixture?.kind === "result") return { type: "fixture", key: "news.kicker.result" };
  if (!isGenericCategory(input.category)) return { type: "category" };
  if (input.clubCount === 1 && input.clubs.length === 1)
    return { type: "club", club: input.clubs[0] };
  return null;
}
