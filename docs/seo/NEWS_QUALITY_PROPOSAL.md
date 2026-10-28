# News quality: thin and duplicate articles (27 October 2026)

Brief item: Bug 1 point 3 / Task 11 of the SEO brief. Search Console reports
9,165 "Discovered, currently not indexed" URLs, most of them articles, and the
risk is that Google reads the archive as scaled, thin content and discounts the
whole `/news` section, the genuine articles included.

**No data was changed or queried to write this.** The numbers come from the
public site. The SQL at the end is for the owner to run, read-only.

## What was measured

Sample: 120 article pages drawn at random from the live `sitemap.xml` (which
lists 15,769 `/news/` URLs), fetched 27 October 2026 at one request every half
second. Body text is the `editorial-body` block as served, tags removed, words
split at white space (the same rule as `bodyWordCount` in
`src/lib/article-text.ts`). A sample of 120 gives a margin of about 9 points on
a share near 50%, and wider on small shares: read the percentages as orders of
magnitude, and replace them with the SQL counts below.

| Measure                         | Result                                                 |
| ------------------------------- | ------------------------------------------------------ |
| Body length, words              | min 62, median 122, mean 145, max 590                  |
| Under 80 words                  | 8 of 120 (7%)                                          |
| Under 100 words                 | 30 of 120 (25%)                                        |
| Under 150 words                 | 84 of 120 (70%)                                        |
| Under 200 words                 | 108 of 120 (90%)                                       |
| Under 60 words                  | 0 of 120                                               |
| Paragraphs per article          | 3 or more in every case; none single-paragraph         |
| Arabic / French                 | 99 / 21                                                |
| Credit a licensed source        | 119 of 120 ("Source : ..." / "المصدر: ..." under body) |
| BotolaGO's own (no source line) | 1 of 120 (86 words, published 25 October 2026)         |
| Exact duplicate titles          | none in the sample                                     |
| `robots` meta on the page       | none: every sampled article is indexable               |

Other facts that matter for the decision:

- **The archive is the licensed ElBotola import, not three months of writing.**
  The sitemap `lastmod` values run 2021 (1,350), 2022 (3,487), 2023 (2,471),
  2024 (2,572), 2025 (2,945) and 2026 (2,944). The 15.8k articles were loaded
  in one go (September 2026, per the comments in `article-meta.ts`); Google
  found them all at once, which is the shape of the "Discovered" backlog.
- **Short, formulaic reports dominate.** The shortest articles are 62 to 90
  word items of three or four paragraphs: line-ups ("تشكيلة الوداد أمام
  الفتح..."), ticket sales, a 0-0 result, a travel notice. Title patterns
  repeat ("البطولة الاحترافية/ ... (1-1)", "Botola Pro : ..."). They are
  accurate but carry little beyond the headline.
- **Near-duplicates cannot be measured from outside.** The sitemap carries no
  titles and 120 random pages rarely land on two reports of the same match, so
  the sample shows none. The import keeps one story per Arabic original with its
  French translation as a second edition of the same story (hreflang pair), so
  an Arabic/French pair is not a duplicate. Real duplicates would be a match
  reported twice by the source (a preview and a report are not duplicates, two
  line-up items for one match are). Query 4 below counts candidates.

## Proposed criteria

1. **`noindex, follow` for thin editions.** A body under N words. The sample
   suggests three tiers:

   | N   | Share of sample dropped | Extrapolated to 15.8k         | Comment                                                                           |
   | --- | ----------------------- | ----------------------------- | --------------------------------------------------------------------------------- |
   | 60  | 0%                      | under about 400 (none in 120) | Only stubs. **This is what the code safeguard ships with.** Safe, little effect.  |
   | 80  | 7%                      | about 1,100                   | Drops line-up and ticket notices. Reasonable first step.                          |
   | 100 | 25%                     | about 3,900                   | Strong signal to Google; cuts a quarter of the archive, mostly match-day notices. |

   Rationale for starting low: these pages are not "empty", they are short
   news items that readers of a club-news site do open; a `noindex` costs
   nothing for readers (still listed, linked, shareable) but removes the page
   from search, and it takes weeks for Google to drop and weeks to restore. Move
   to 80 after the owner has seen the SQL counts, and to 100 only if the
   indexed share does not improve within a couple of months.

   An exemption for stats and quotes was considered ("under N words unless it
   holds a score table or a quote") and left out: the body is plain HTML
   paragraphs with no structured stats, and quotes appear even in the shortest
   items (the 70-word "الكورفا سود" item has 8 quotation marks), so the test
   would not separate good from thin. If wanted, the SQL below counts it.

2. **Merge or retire duplicates.** Where two editions in the same language
   cover the same match from the same source on the same day with the same
   kind of item (two line-ups, two results), keep the longer one and either
   `noindex` the other or redirect it to the kept one (a 301 from the shorter
   edition's URL to the longer). Candidates come from Query 4. A redirect needs
   a mapping table and a change to the article route, so it is a separate task
   once the owner has seen the count.

3. **Take `noindex` articles out of the sitemap.** Not done in code: the
   sitemap lists articles through the database function behind
   `/sitemaps/news-YYYY-MM.xml`, and dropping a row there needs a change to
   that RPC (a migration, so the owner's call). A page that is both
   `noindex` and in the sitemap is a mixed signal Search Console reports as
   "Submitted URL marked noindex"; do the RPC change in the same release as
   any threshold above 60 that actually affects pages. The cheapest filter is
   the one Query 2 uses (word count computed in SQL, or a stored
   `body_word_count` column filled by the import).

4. **Not proposed:** deleting articles (breaks inbound links, and the licence
   terms are the owner's), or `noindex` on a whole language.

## What the code does now

`buildArticleHead` in `src/lib/article-meta.ts` adds
`<meta name="robots" content="noindex, follow">` when
`bodyWordCount(article.bodyHtml) < MIN_INDEXABLE_BODY_WORDS`. The constant is
exported, currently **60**; `0` switches the rule off. It applies to licensed
and own articles alike, to either language, and does not touch the "missing
article" `noindex` or the 503 path. The sitemap is unchanged. The effect
appears when the site is next published; with 60, the sample says almost no
page is hit, so it is a backstop for stubs, not the fix for the 9,165.

Tests: `src/lib/article-meta.test.ts` ("thin articles") cover below, at and
above the threshold, Arabic word counting, licensed articles, and that a
missing article keeps its single plain `noindex`.

## Read-only SQL for the owner

Tables: `app.article_editions` (one row per language edition: `title`,
`body_html`, `language`, `status`, `visibility`, `published_at`, `story_id`),
`app.stories` (`origin` is `manual`, `provider` or `partner`; `publisher_id`,
`canonical_url`), `app.publishers` (`syndication_licensed_at` is set for the
licensed archive, which is what the public API uses to emit `source`). Run
these as `select` only, on a read replica or off-peak; Query 1 scans every body.

The word count strips tags and counts white-space-separated tokens, the same
rule as `bodyWordCount`. It treats `&nbsp;` as a space.

```sql
-- 0. Published, public editions: the denominator, by language and origin.
select e.language, s.origin,
       (p.syndication_licensed_at is not null) as licensed,
       count(*) as editions
from app.article_editions e
join app.stories s on s.id = e.story_id
left join app.publishers p on p.id = s.publisher_id
where e.status = 'published' and e.visibility = 'public' and s.deleted_at is null
group by 1, 2, 3
order by 1, 2, 3;

-- 1. Word-count histogram of published editions, split by licensed or own.
with w as (
  select e.id, e.language,
         (p.syndication_licensed_at is not null) as licensed,
         coalesce(array_length(regexp_split_to_array(
           btrim(regexp_replace(replace(regexp_replace(e.body_html, '<[^>]*>', ' ', 'g'),
                                        '&nbsp;', ' '), '\s+', ' ', 'g')), ' '), 1), 0) as words
  from app.article_editions e
  join app.stories s on s.id = e.story_id
  left join app.publishers p on p.id = s.publisher_id
  where e.status = 'published' and e.visibility = 'public' and s.deleted_at is null
)
select language, licensed,
       count(*)                                 as editions,
       count(*) filter (where words < 60)       as under_60,
       count(*) filter (where words < 80)       as under_80,
       count(*) filter (where words < 100)      as under_100,
       count(*) filter (where words < 150)      as under_150,
       percentile_cont(0.5) within group (order by words) as median_words
from w
group by 1, 2
order by 1, 2;

-- 2. The affected rows themselves, for a threshold N (here 80), newest first.
--    Keep this shape for the sitemap RPC filter.
select e.id, e.language, e.published_at, e.title, w.words
from app.article_editions e
join app.stories s on s.id = e.story_id
cross join lateral (
  select coalesce(array_length(regexp_split_to_array(
           btrim(regexp_replace(replace(regexp_replace(e.body_html, '<[^>]*>', ' ', 'g'),
                                        '&nbsp;', ' '), '\s+', ' ', 'g')), ' '), 1), 0) as words
) w
where e.status = 'published' and e.visibility = 'public' and s.deleted_at is null
  and w.words < 80
order by e.published_at desc
limit 200;

-- 3. Short items that nevertheless hold a quote or a score (the exemption
--    considered and left out): a score "1-1", or a quotation mark.
select count(*) as short_with_quote_or_score
from app.article_editions e
join app.stories s on s.id = e.story_id
where e.status = 'published' and e.visibility = 'public' and s.deleted_at is null
  and char_length(regexp_replace(e.body_html, '<[^>]*>', '', 'g')) < 600
  and (e.body_html ~ '[«»“”"]' or e.body_html ~ '\d\s*[-–]\s*\d');

-- 4. Duplicate candidates, same language: identical normalised title.
select e.language, lower(btrim(e.title)) as title_key,
       count(*) as editions, min(e.published_at) as first_published,
       array_agg(e.id order by e.published_at) as ids
from app.article_editions e
join app.stories s on s.id = e.story_id
where e.status = 'published' and e.visibility = 'public' and s.deleted_at is null
group by 1, 2
having count(*) > 1
order by editions desc
limit 100;

-- 4b. Near-duplicates: same language and same day, same first 40 characters
--     of the title (a match announced twice under a reworded headline).
select e.language, e.published_at::date as day, left(lower(btrim(e.title)), 40) as title_start,
       count(*) as editions, array_agg(e.id order by e.published_at) as ids
from app.article_editions e
join app.stories s on s.id = e.story_id
where e.status = 'published' and e.visibility = 'public' and s.deleted_at is null
group by 1, 2, 3
having count(*) > 1
order by editions desc
limit 100;

-- 5. Same text under different stories: identical body after normalisation.
select e.language, md5(regexp_replace(e.body_html, '\s+', ' ', 'g')) as body_key,
       count(*) as editions, array_agg(e.id) as ids
from app.article_editions e
join app.stories s on s.id = e.story_id
where e.status = 'published' and e.visibility = 'public' and s.deleted_at is null
group by 1, 2
having count(*) > 1
order by editions desc
limit 100;
```

Expected shape of the answers, from the sample (to be confirmed by Query 1):
about 99% of editions licensed, about 80% Arabic, median 120 or so words, 7%
under 80, 25% under 100. Query 4 should come back near zero for exact titles;
4b and 5 are where real duplicates would show.

## Decision (2026-10-27)

The threshold stays at **60**. Measured on production with Query 1 the same
day, over 15,771 public editions:

| Language | Editions | Under 60 | Under 80 | Under 100 | Median words |
| -------- | -------: | -------: | -------: | --------: | -----------: |
| French   |    2,524 |       10 |       60 |       269 |          159 |
| Arabic   |   13,247 |      195 |    1,920 |     4,655 |          113 |

At 80, 1,920 of the 1,980 hidden editions would be Arabic (14% of the Arabic
archive). An Arabic word is longer than a French one (articles and
prepositions join the word), so one word count for both languages hides Arabic
first, and Arabic is where the site ranks worst. A higher bar waits for the
sitemap filter (point 3) and, if wanted, a per-language threshold.

## Decisions the owner needs to make

1. The threshold N (60 now; 80 suggested next). Edit
   `MIN_INDEXABLE_BODY_WORDS` in `src/lib/article-meta.ts`.
2. Whether to filter the sitemap by the same rule (an RPC change) in the same
   release.
3. Whether duplicates found by Queries 4, 4b and 5 are merged by redirect or only
   `noindex`ed.
4. Whether to keep indexing the licensed archive at all beyond a cut: the
   alternative with the strongest effect is `noindex` on everything older than
   a chosen date (the 2021 to 2023 items are 7,300 of the 15,769, 46%); it is
   a business decision about the licence, not an SEO one, and is listed only
   so it is on the table.
