// Licensed ElBotola import (owner-reported licence recorded on
// app.publishers.syndication_license_note, 2026-09-24).
//
// Reads ElBotola's Botola Pro articles (Arabic, and French where ElBotola
// published one) from its public API, pairs each French article with the
// Arabic original it was translated from, and writes them into production as
// PRIVATE DRAFTS under the licensed ElBotola publisher, keeping ElBotola's
// publication date and the journalist's byline. The site credits the source
// and keeps these pages out of search (20260924100000).
//
// Article text is fetched at run time and never written to the repository or
// the run's logs; only counts are reported.
//
//   MODE=dry-run  every batch runs in full and is then rolled back
//   MODE=import   batches are committed; stories already present are skipped,
//                 so a stopped run can simply be started again

import { createHash, randomBytes } from "node:crypto";
import { NEWS_SANITIZER_VERSION, sanitizeEditorialHtml } from "../../src/backend/news/sanitizer";

export const ELBOTOLA_API = "https://api.elbotola.com";
export const BOTOLA_PRO_TAG = "z318q66hokoqo9j";
export const DEFAULT_CUTOFF = "2021-09-23T00:00:00Z";
const USER_AGENT = "BotolaGO-LicensedImport/1.0 (+https://botolago.com)";
const ARTICLE_URL =
  /^https:\/\/www\.elbotola\.com\/article\/(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d+)\.html$/;

export interface ElbotolaArticle {
  readonly id: string;
  readonly language: "ar" | "fr";
  readonly url: string;
  readonly title: string;
  readonly author: string | null;
  readonly publishedAt: string;
  readonly html: string;
  readonly translatedFrom: string | null;
}

export interface ImportEdition {
  readonly language: "ar" | "fr";
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly bodyHtml: string;
  readonly readingTime: number;
  readonly publishedAt: string;
  readonly author: string | null;
}

export interface ImportStory {
  readonly key: string;
  readonly canonicalUrl: string | null;
  readonly originalLanguage: "ar" | "fr";
  readonly fingerprint: string;
  readonly editions: readonly ImportEdition[];
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  nbsp: " ",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name[0] === "#") {
      const code =
        name[1]?.toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    }
    return ENTITIES[name.toLowerCase()] ?? entity;
  });
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** ElBotola's article HTML as plain paragraphs: no links (its tag links point
 *  at ElBotola pages), no images, no embeds. */
export function articleText(html: string): string[] {
  const text = html
    .replace(/<(script|style|iframe|figure)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|blockquote|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter(Boolean);
}

function clip(value: string, limit: number): string {
  const flat = value.split(/\s+/).join(" ").trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 1))}…`;
}

function slugId(url: string, fallback: string): string {
  return ARTICLE_URL.exec(url)?.[1] ?? fallback;
}

export function toEdition(article: ElbotolaArticle): ImportEdition | null {
  const paragraphs = articleText(article.html);
  const title = clip(article.title, 220);
  if (!paragraphs.length || title.length < 5) return null;
  const words = paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
  let bodyHtml: string;
  try {
    bodyHtml = sanitizeEditorialHtml(
      paragraphs.map((line) => `<p>${escapeHtml(line)}</p>`).join(""),
    );
  } catch {
    return null; // too short to be an article once cleaned
  }
  const summary = clip(paragraphs[0]!, 300);
  if (summary.length < 10) return null;
  return {
    language: article.language,
    slug: `elbotola-${slugId(article.url, article.id)}`,
    title,
    summary,
    bodyHtml,
    readingTime: Math.max(1, Math.min(180, Math.ceil(words / 220))),
    publishedAt: article.publishedAt,
    author: article.author?.trim().slice(0, 120) || null,
  };
}

/**
 * One story per Arabic original, with the French edition ElBotola translated
 * from it when there is one; a French article with no Arabic original is a
 * French-only story (ElBotola serves no page at a French article's own URL,
 * so it has no original to link). Stories whose original BotolaGO already
 * holds are left out.
 */
export function buildStories(
  arabic: readonly ElbotolaArticle[],
  french: readonly ElbotolaArticle[],
  existingUrls: ReadonlySet<string>,
): { stories: ImportStory[]; skippedExisting: number; unusable: number } {
  const arabicById = new Map(arabic.map((article) => [article.id, article]));
  const frenchByOriginal = new Map<string, ElbotolaArticle>();
  const frenchOnly: ElbotolaArticle[] = [];
  for (const article of french) {
    const original = article.translatedFrom ? arabicById.get(article.translatedFrom) : undefined;
    if (original && !frenchByOriginal.has(original.id)) frenchByOriginal.set(original.id, article);
    else frenchOnly.push(article);
  }

  const stories: ImportStory[] = [];
  let skippedExisting = 0;
  let unusable = 0;
  const fingerprint = (key: string) => createHash("sha256").update(key).digest("hex");

  for (const article of arabic) {
    if (existingUrls.has(article.url)) {
      skippedExisting += 1;
      continue;
    }
    const edition = toEdition(article);
    if (!edition) {
      unusable += 1;
      continue;
    }
    const key = slugId(article.url, article.id);
    const translation = frenchByOriginal.get(article.id);
    const frenchEdition = translation ? toEdition(translation) : null;
    stories.push({
      key,
      canonicalUrl: article.url,
      originalLanguage: "ar",
      fingerprint: fingerprint(key),
      editions: frenchEdition ? [edition, frenchEdition] : [edition],
    });
  }
  for (const article of frenchOnly) {
    const edition = toEdition(article);
    if (!edition) {
      unusable += 1;
      continue;
    }
    const key = slugId(article.url, article.id);
    stories.push({
      key,
      canonicalUrl: null,
      originalLanguage: "fr",
      fingerprint: fingerprint(key),
      editions: [edition],
    });
  }
  stories.sort((a, b) => b.editions[0]!.publishedAt.localeCompare(a.editions[0]!.publishedAt));
  return { stories, skippedExisting, unusable };
}

function literal(value: string | number | null): string {
  if (value === null) return "null";
  if (typeof value === "number") return String(Math.trunc(value));
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * One guarded, idempotent batch. Refuses to run without a recorded ElBotola
 * licence; skips stories BotolaGO already holds; refuses an edition slug that
 * something else already uses. In dry-run mode it raises at the end, so the
 * whole batch is rolled back after every statement has run.
 *
 * The rows sit inside the DO block's dollar-quoted body, where single-quote
 * escaping protects nothing against the body's own closing tag. The tag is
 * therefore random per batch, and the batch is refused outright if any
 * provider text contains it, so ElBotola content can never end the body early.
 *
 * `published` writes public editions with ElBotola's own publication date
 * (the owner's instruction, 2026-09-24); `draft` writes private drafts.
 */
export function batchSql(
  stories: readonly ImportStory[],
  dryRun: boolean,
  status: "draft" | "published" = "draft",
  tag = `$import_${randomBytes(12).toString("hex")}$`,
): string {
  if (!/^\$[a-z_][a-z0-9_]*\$$/.test(tag)) throw new Error("invalid dollar-quote tag");
  for (const story of stories) {
    const values = [story.key, story.canonicalUrl ?? ""].concat(
      story.editions.flatMap((edition) => [
        edition.slug,
        edition.title,
        edition.summary,
        edition.bodyHtml,
        edition.author ?? "",
      ]),
    );
    if (values.some((value) => value.includes(tag))) {
      throw new Error("provider text contains the batch delimiter; refusing the batch");
    }
  }
  const rows = stories.flatMap((story) =>
    story.editions.map(
      (edition) =>
        `(${[
          literal(story.key),
          literal(story.canonicalUrl),
          literal(story.originalLanguage),
          literal(story.fingerprint),
          literal(edition.language),
          literal(edition.slug),
          literal(edition.title),
          literal(edition.summary),
          literal(edition.bodyHtml),
          literal(edition.readingTime),
          literal(edition.publishedAt),
          literal(edition.author),
        ].join(", ")})`,
    ),
  );
  return `do ${tag}
declare
  licensed_publisher app.publishers%rowtype;
  new_stories integer := 0;
  new_editions integer := 0;
begin
  create temporary table licensed_batch (
    story_key text, canonical_url text, original_language text, fingerprint text,
    language text, slug text, title text, summary text, body_html text,
    reading_time integer, published_at timestamptz, author_name text
  ) on commit drop;
  insert into licensed_batch values
${rows.join(",\n")};

  select * into licensed_publisher from app.publishers where slug = 'elbotola';
  if not found or licensed_publisher.syndication_licensed_at is null then
    raise exception 'guard: ElBotola has no recorded licence';
  end if;
  delete from licensed_batch b where exists (
    select 1 from app.stories s where s.content_fingerprint = b.fingerprint or s.canonical_url = b.canonical_url
  );
  if exists (select 1 from app.article_editions e join licensed_batch b
             on e.language = b.language::app.language_code and e.slug = b.slug) then
    raise exception 'guard: an edition slug is already taken';
  end if;

  insert into app.authors (slug, display_name, author_type)
  select distinct 'elbotola-' || left(md5(author_name), 12), author_name, 'guest'::app.author_type
  from licensed_batch where author_name is not null and char_length(author_name) >= 2
  on conflict (slug) do nothing;

  insert into app.stories (origin, original_language, publisher_id, author_id, canonical_url, content_fingerprint)
  select distinct on (b.story_key) 'partner', b.original_language::app.language_code, licensed_publisher.id,
    author.id, b.canonical_url, b.fingerprint
  from licensed_batch b
  left join app.authors author on author.slug = 'elbotola-' || left(md5(b.author_name), 12)
  order by b.story_key, (b.language = b.original_language) desc;
  get diagnostics new_stories = row_count;

  insert into app.article_editions (
    story_id, language, slug, title, summary, body_format, body_source, body_html,
    status, visibility, published_at, reading_time_minutes, sanitizer_version
  )
  select s.id, b.language::app.language_code, b.slug, b.title, b.summary, 'rich_text', null, b.body_html,
    ${status === "published" ? "'published', 'public'" : "'draft', 'private'"}, b.published_at, b.reading_time, ${literal(NEWS_SANITIZER_VERSION)}
  from licensed_batch b join app.stories s on s.content_fingerprint = b.fingerprint;
  get diagnostics new_editions = row_count;

  if new_stories > 0 then
    perform app_private.write_editorial_audit(
      'licensed_import_batch', null, null,
      jsonb_build_object('publisher', 'elbotola', 'stories', new_stories, 'editions', new_editions)
    );
  end if;
${
  dryRun
    ? "  raise exception 'DRY_RUN_ROLLBACK stories=% editions=%', new_stories, new_editions;"
    : "  raise notice 'IMPORTED stories=% editions=%', new_stories, new_editions;"
}
end
${tag};`;
}

// ---------------------------------------------------------------- runtime

interface Runtime {
  readonly accessToken: string;
  readonly projectRef: string;
  readonly mode: "dry-run" | "import";
  readonly status: "draft" | "published";
  readonly cutoff: string;
  readonly limit: number | null;
  readonly batchSize: number;
}

function readRuntime(env: Record<string, string | undefined>): Runtime {
  if (env.CONFIRMATION !== "RUN_ELBOTOLA_LICENSED_IMPORT")
    throw new Error("confirmation text mismatch");
  if (!env.EXPECTED_COMMIT || env.EXPECTED_COMMIT !== env.GITHUB_SHA) {
    throw new Error("expected_commit does not match the checked-out commit");
  }
  const mode = env.IMPORT_MODE;
  if (mode !== "dry-run" && mode !== "import")
    throw new Error("IMPORT_MODE must be dry-run or import");
  const status = env.IMPORT_STATUS;
  if (status !== "draft" && status !== "published")
    throw new Error("IMPORT_STATUS must be draft or published");
  const accessToken = env.SUPABASE_ACCESS_TOKEN?.trim();
  const projectRef = env.SUPABASE_PRODUCTION_PROJECT_REF?.trim();
  if (!accessToken || !projectRef || !/^[a-z0-9]{20}$/.test(projectRef)) {
    throw new Error("production project configuration missing");
  }
  const limit = env.IMPORT_LIMIT?.trim() ? Number(env.IMPORT_LIMIT) : null;
  if (limit !== null && (!Number.isInteger(limit) || limit < 1))
    throw new Error("IMPORT_LIMIT must be a positive integer");
  return {
    accessToken,
    projectRef,
    mode,
    status,
    cutoff: DEFAULT_CUTOFF,
    limit,
    batchSize: 25,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url: string, attempts = 6): Promise<unknown> {
  let wait = 5_000;
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": USER_AGENT, accept: "application/json" },
      });
      if (response.ok) return await response.json();
      if (response.status === 404) return null;
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt >= attempts) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      if (attempt >= attempts) throw error;
    }
    await sleep(wait);
    wait = Math.min(wait * 2, 300_000);
  }
}

interface FeedItem {
  readonly object_id: string;
  readonly absolute_url: string;
  readonly pub_date: number;
}

async function listFeed(language: "ar" | "fr", cutoff: string): Promise<FeedItem[]> {
  const cutoffSeconds = Date.parse(cutoff) / 1000;
  const items: FeedItem[] = [];
  for (let page = 1; ; page += 1) {
    const data = (await getJson(
      `${ELBOTOLA_API}/newsfeed/v3/?lang=${language}&content_type=article&tag_id=${BOTOLA_PRO_TAG}&page_size=100&page=${page}`,
    )) as { results?: FeedItem[]; next?: string | null } | null;
    if (!data?.results?.length) break;
    items.push(...data.results.filter((item) => item.pub_date >= cutoffSeconds));
    if (!data.next || data.results[data.results.length - 1]!.pub_date < cutoffSeconds) break;
    await sleep(500);
  }
  return items;
}

async function fetchArticles(
  items: readonly FeedItem[],
  language: "ar" | "fr",
): Promise<ElbotolaArticle[]> {
  const articles: ElbotolaArticle[] = [];
  for (const [index, item] of items.entries()) {
    const started = Date.now();
    const data = (await getJson(`${ELBOTOLA_API}/articles/${item.object_id}/`)) as Record<
      string,
      unknown
    > | null;
    if (data && typeof data.html_content === "string" && typeof data.title === "string") {
      articles.push({
        id: item.object_id,
        language,
        url: item.absolute_url,
        title: data.title,
        author: typeof data.custom_author === "string" ? data.custom_author : null,
        publishedAt: new Date(item.pub_date * 1000).toISOString(),
        html: data.html_content,
        translatedFrom: typeof data.translated_from === "string" ? data.translated_from : null,
      });
    }
    if ((index + 1) % 500 === 0) console.log(`fetched ${language} ${index + 1}/${items.length}`);
    await sleep(Math.max(0, 500 - (Date.now() - started)));
  }
  return articles;
}

async function sql(
  runtime: Runtime,
  query: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${runtime.projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${runtime.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
  );
  return { ok: response.ok, status: response.status, body: await response.text() };
}

async function count(runtime: Runtime, query: string): Promise<number> {
  const result = await sql(runtime, query);
  if (!result.ok) throw new Error(`count query failed with HTTP ${result.status}`);
  const rows = JSON.parse(result.body) as { count: number | string }[];
  return Number(rows[0]?.count ?? NaN);
}

async function main(): Promise<void> {
  const runtime = readRuntime(process.env);
  console.log(
    `mode=${runtime.mode} status=${runtime.status} cutoff=${runtime.cutoff} limit=${runtime.limit ?? "all"}`,
  );

  const licensed = await count(
    runtime,
    "select count(*) from app.publishers where slug = 'elbotola' and syndication_licensed_at is not null",
  );
  if (licensed !== 1) throw new Error("ElBotola has no recorded licence in production");
  // Everything public that is not a licensed ElBotola story must be left
  // exactly as it was; ElBotola's own count is reported separately.
  const otherPublicSql =
    "select count(*) from app.article_editions e join app.stories s on s.id = e.story_id " +
    "left join app.publishers p on p.id = s.publisher_id " +
    "where app_private.news_is_public(e) and not (p.slug is not distinct from 'elbotola' and s.origin = 'partner')";
  const otherPublicBefore = await count(runtime, otherPublicSql);
  const licensedStoriesSql =
    "select count(*) from app.stories s join app.publishers p on p.id = s.publisher_id " +
    "where p.slug = 'elbotola' and s.origin = 'partner'";
  const elbotolaBefore = await count(runtime, licensedStoriesSql);

  const existingResult = await sql(
    runtime,
    "select canonical_url from app.stories where canonical_url like 'https://www.elbotola.com/article/%'",
  );
  if (!existingResult.ok)
    throw new Error(`existing-story query failed with HTTP ${existingResult.status}`);
  const existing = new Set(
    (JSON.parse(existingResult.body) as { canonical_url: string }[]).map(
      (row) => row.canonical_url,
    ),
  );

  const arabicFeed = await listFeed("ar", runtime.cutoff);
  const frenchFeed = await listFeed("fr", runtime.cutoff);
  console.log(`listed ar=${arabicFeed.length} fr=${frenchFeed.length}`);
  const arabic = await fetchArticles(arabicFeed, "ar");
  const french = await fetchArticles(frenchFeed, "fr");
  const built = buildStories(arabic, french, existing);
  const stories = runtime.limit ? built.stories.slice(0, runtime.limit) : built.stories;
  console.log(
    `stories=${stories.length} editions=${stories.reduce((n, s) => n + s.editions.length, 0)} ` +
      `skipped_existing=${built.skippedExisting} unusable=${built.unusable}`,
  );

  let committedStories = 0;
  let committedEditions = 0;
  for (let offset = 0; offset < stories.length; offset += runtime.batchSize) {
    const batch = stories.slice(offset, offset + runtime.batchSize);
    const result = await sql(runtime, batchSql(batch, runtime.mode === "dry-run", runtime.status));
    if (runtime.mode === "dry-run") {
      const match = /DRY_RUN_ROLLBACK stories=(\d+) editions=(\d+)/.exec(result.body);
      if (!match) throw new Error(`dry-run batch at ${offset} failed with HTTP ${result.status}`);
      committedStories += Number(match[1]);
      committedEditions += Number(match[2]);
    } else if (!result.ok) {
      throw new Error(`import batch at ${offset} failed with HTTP ${result.status}`);
    }
    if ((offset / runtime.batchSize) % 20 === 0)
      console.log(`batches done: ${offset + batch.length}/${stories.length}`);
  }

  const elbotolaAfter = await count(runtime, licensedStoriesSql);
  const otherPublicAfter = await count(runtime, otherPublicSql);
  if (otherPublicAfter !== otherPublicBefore) {
    throw new Error("public articles other than ElBotola's changed");
  }
  if (runtime.mode === "dry-run" && elbotolaAfter !== elbotolaBefore) {
    throw new Error("a dry run left licensed ElBotola stories behind");
  }
  console.log(
    runtime.mode === "dry-run"
      ? `DRY RUN complete: would import stories=${committedStories} editions=${committedEditions} ` +
          `as ${runtime.status}; nothing kept (ElBotola licensed stories still ${elbotolaAfter})`
      : `IMPORT complete (${runtime.status}): ElBotola licensed stories ${elbotolaBefore} -> ${elbotolaAfter} ` +
          `(+${elbotolaAfter - elbotolaBefore}); other public articles unchanged (${otherPublicAfter})`,
  );
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(`FAILED: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exit(1);
  });
}
