import type { ArticleCursor, NewsLanguage } from "@/backend/news/contracts";
import type { SitemapNewsEntry } from "@/lib/sitemap";

/**
 * The paged News archive, `/news/archive?page=N`.
 *
 * The feed behind it (`api.news_feed`) pages by keyset: it reads "the 50 after
 * this article", never "page 300", and a migration for an offset is out of
 * scope. The sitemap snapshot (`api.news_sitemap_entries`) already lists every
 * public edition with its publication time, in the feed's order (newest first,
 * the id breaking ties), so the first article of any page is found there and
 * the feed is then read from the cursor just before it. Page N is the same
 * 50 articles the feed would give a reader who loaded N pages.
 */
export const NEWS_ARCHIVE_PAGE_SIZE = 50;

/** One language's pages: how many articles, and where each page after the first starts. */
export interface NewsArchivePlan {
  readonly total: number;
  /** `cursors[k]` is the cursor that opens page `k + 2`. */
  readonly cursors: readonly ArticleCursor[];
}

export type NewsArchivePlans = Readonly<Record<NewsLanguage, NewsArchivePlan>>;

export const EMPTY_ARCHIVE_PLAN: NewsArchivePlan = { total: 0, cursors: [] };

function newestFirst(a: SitemapNewsEntry, b: SitemapNewsEntry): number {
  const byTime = Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  if (byTime !== 0 && !Number.isNaN(byTime)) return byTime;
  // The database compares uuids bytewise; lower-case hex compares the same.
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export function buildNewsArchivePlan(
  entries: readonly SitemapNewsEntry[],
  language: NewsLanguage,
  pageSize: number = NEWS_ARCHIVE_PAGE_SIZE,
): NewsArchivePlan {
  const own = entries
    .filter((entry) => entry.language === language && !Number.isNaN(Date.parse(entry.publishedAt)))
    .sort(newestFirst);
  const cursors: ArticleCursor[] = [];
  for (let last = pageSize - 1; last < own.length - 1; last += pageSize) {
    const entry = own[last];
    cursors.push({ publishedAt: entry.publishedAt, id: entry.id });
  }
  return { total: own.length, cursors };
}

export function buildNewsArchivePlans(
  entries: readonly SitemapNewsEntry[],
  pageSize: number = NEWS_ARCHIVE_PAGE_SIZE,
): NewsArchivePlans {
  return {
    fr: buildNewsArchivePlan(entries, "fr", pageSize),
    ar: buildNewsArchivePlan(entries, "ar", pageSize),
  };
}

export function archivePageCount(plan: NewsArchivePlan): number {
  return plan.cursors.length + 1;
}

/** The cursor that opens `page`, `null` for the first page, `undefined` past the last. */
export function archiveCursorFor(
  plan: NewsArchivePlan,
  page: number,
): ArticleCursor | null | undefined {
  if (page <= 1) return null;
  return plan.cursors[page - 2];
}

export interface NewsArchiveSearch {
  readonly page?: number;
}

/**
 * `?page=3` and nothing else: a page that is not a whole number from 2 up is
 * the first page (and so is no key), so `?page=1` and `?page=abc` do not make
 * a second URL for `/news/archive`.
 */
export function validateNewsArchiveSearch(search: Record<string, unknown>): NewsArchiveSearch {
  const raw = search.page;
  const page = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isSafeInteger(page) && page >= 2 ? { page } : {};
}

export function archivePageOf(search: NewsArchiveSearch): number {
  return search.page ?? 1;
}

/** `null` stands for the gap between two runs of page numbers. */
export type ArchivePageLink = number | null;

/**
 * The page numbers to link from `current` of `last`: the first and last, a
 * window around the current page, the current ten, and every tenth page. The
 * tenth pages and the ten they open are what keep every archive page within
 * two clicks of the first (page 1 links 150, which links 151 to 159), where a
 * window alone would take 300.
 */
export function archivePageLinks(current: number, last: number): ArchivePageLink[] {
  const wanted = new Set<number>([1, last]);
  for (let page = current - 2; page <= current + 2; page += 1) wanted.add(page);
  const tenStart = Math.max(Math.floor(current / 10) * 10, 1);
  for (let page = tenStart; page < tenStart + 10; page += 1) wanted.add(page);
  for (let page = 10; page < last; page += 10) wanted.add(page);
  const pages = [...wanted].filter((page) => page >= 1 && page <= last).sort((a, b) => a - b);
  const links: ArchivePageLink[] = [];
  pages.forEach((page, index) => {
    if (index > 0 && page - pages[index - 1] > 1) links.push(null);
    links.push(page);
  });
  return links;
}
