# BotolaGO SEO operating system

Status: implementation baseline, 26 September 2026

## Outcome

BotolaGO should not try to beat established score sites by publishing more generic football news. Its defensible search position is the combination of:

1. the most useful Botola Pro match, table, club and player entity pages in French and Arabic;
2. the clearest Botola Pro Fantasy product and advice library;
3. original, attributable reporting and Fantasy analysis that adds something a licensed source did not already publish.

The primary business outcome is qualified organic visitors who return for matches and Fantasy, then create a Fantasy team. Rankings and raw pageviews are supporting metrics, not the goal.

## Evidence baseline

The production crawl and current `main` branch were inspected before this plan was written.

| Finding                    |                                                                   Baseline | Consequence                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------: | ----------------------------------------------------------------------------------------------------------- |
| Sitemap URLs               |                                                                     15,702 | Crawl capacity is overwhelmingly allocated to News.                                                         |
| News URLs                  |                                                                     15,690 | Imported archive quality and index coverage must be measured before adding more archive content.            |
| Non-News URLs              |                                                                         12 | The site's differentiated match, club and Fantasy surfaces are underrepresented.                            |
| Sitemap size               |                                                               about 2.7 MB | Valid today, but it needs a split before it approaches 50,000 URLs or 50 MB uncompressed.                   |
| Google Search Console data |                                 not connected to the available SEO project | No honest claim can yet be made about rankings, clicks, impressions or index coverage.                      |
| Generic French results     | dominated by Flashscore, Sofascore, FRMF, L'Équipe and similar authorities | Generic “scores” and “classement” queries require a better local experience, not commodity copy.            |
| Botola Fantasy results     |                                 visibly sparse in the sampled live results | This looks strategically attractive, but search volume must still be validated with GSC or Keyword Planner. |
| Raw HTML                   |                    canonical, H1 and crawlable data exist on the main hubs | The SSR foundation is sound. Several public pages are still thin before JavaScript.                         |
| Article metadata           |      many sampled headlines and descriptions exceed common snippet lengths | Editors need purposeful SEO copy; automated clipping must not remove the named player or club.              |
| Internal links             |                                          article club chips were not links | News authority did not flow to the corresponding club entities.                                             |

Do not convert these observations into invented traffic forecasts. Pull the real data listed in Module 3.

## Module 1 — How search applies to BotolaGO

BotolaGO has two search products:

- Classic search: rankings and clicks for match, table, club, player, Fantasy and news queries.
- Answer engines: citations in AI Overviews, ChatGPT, Perplexity and similar products.

Both need the same foundation: crawlable HTML, one canonical URL per entity, specific facts, clear provenance, structured data, useful internal links and original information.

The scaled-content-abuse risk is material. A licence to use an archive is not proof that thousands of lightly changed pages offer search value. Keep source attribution and `isBasedOn`; do not remove it for SEO. Measure which archive pages are indexed or earning demand before deciding whether old or weak editions should remain indexable, be consolidated, or be excluded from the sitemap.

## Module 2 — BotolaGO site brief and voice

### Site brief

- Product: bilingual Moroccan football product covering Botola Pro news, fixtures, live state, results, standings, club pages, player data, predictions and Fantasy.
- Core audience: Moroccan football supporters in Morocco and abroad, primarily consuming French, Arabic or both.
- Primary action: create and actively manage a BotolaGO Fantasy team.
- Repeat actions: check today's matches, standings, club updates, player form and Fantasy points.
- Differentiator: Botola-specific product depth in one place, especially Fantasy and linked club/player/match data.
- Trust requirement: distinguish official data, provisional live data, editorial analysis and licensed reporting.

### Voice guide

- Put the score, decision, deadline or answer first.
- Use the club and player names supporters use; preserve official names where ambiguity matters.
- Be direct, specific and useful. Avoid generic hype and filler.
- Never invent a quote, injury, lineup, transfer, statistic, source, search volume or first-hand experience.
- State when a table or Fantasy score is provisional.
- For licensed reporting, add attribution and a link to the original. Permission is not a reason to conceal provenance.
- French should sound native to Moroccan football coverage. Arabic should be authored or reviewed as Arabic, not published as an unchecked literal translation.

## Module 3 — Keyword research without invented numbers

### Required inputs

1. Connect `https://botolago.com/` in Google Search Console and wait for data to accumulate.
2. Export the last 28 and 90 days by query and page.
3. Export a combined query + page dataset through the Search Console API, Looker Studio or another connector. Separate UI exports cannot prove which page ranks for each query.
4. Pull Moroccan volume and difficulty from Google Keyword Planner, Ahrefs or Semrush in both French and Arabic.

### Seed groups

Use these as seeds, not as claims that they have volume:

| Group   | French seeds                                                        | Arabic seeds                                                | Likely intent      |
| ------- | ------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------ |
| Live    | match Botola aujourd'hui, score Botola en direct, calendrier Botola | مباريات البطولة اليوم، نتائج البطولة مباشرة، برنامج البطولة | live utility       |
| Table   | classement Botola Pro, classement championnat marocain              | ترتيب البطولة الاحترافية، ترتيب الدوري المغربي              | recurring utility  |
| Clubs   | Wydad match, Raja classement, FAR Rabat joueurs                     | مباراة الوداد، ترتيب الرجاء، لاعبو الجيش الملكي             | entity/navigation  |
| Fantasy | Fantasy Botola, joueurs Fantasy Botola, points Fantasy Botola       | فانتازي البطولة، لاعبو فانتازي البطولة، نقاط الفانتازي      | product/commercial |
| Advice  | meilleur capitaine Fantasy Botola, transferts Fantasy Botola        | أفضل كابتن فانتازي البطولة، انتقالات الفانتازي              | decision support   |
| News    | actualité Botola, mercato Botola, blessures Botola                  | أخبار البطولة، انتقالات البطولة، إصابات اللاعبين            | fresh information  |

Classify every exported keyword by intent, funnel stage, target page and confidence. A live result page is the final authority when intent is ambiguous.

### Opportunity lists

- Quick wins: queries already in positions 8–20, club/player queries where BotolaGO owns the exact entity page, and Fantasy queries with a matching live feature.
- Authority builders: original scoring explainers, weekly data analysis, player form tables and transparent methodology pages.
- Later: broad football news terms, international football terms and any query whose current result set is unrelated to BotolaGO's product.

## Module 4 — Topical map

The map starts with existing product pages. New pages should be created only when they satisfy a distinct intent.

| Pillar                | Existing canonical            | Clusters                                                                         | State                                                                        |
| --------------------- | ----------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Matches Botola Pro    | `/matches`                    | individual matches, today's programme, results by round                          | Hub exists; improve discoverability of detail pages.                         |
| Classement Botola Pro | `/matches/standings`          | home/away form, title race, relegation context, round summaries                  | Core page exists.                                                            |
| Clubs Botola Pro      | `/clubs`                      | one page per club, squad, fixtures, results, club news                           | Entity pages exist; News now links to them.                                  |
| Fantasy Botola        | `/fantasy`                    | rules, help, players, top players, fixture difficulty, rankings                  | Strongest differentiated cluster; public pages are now added to the sitemap. |
| Fantasy advice        | planned `/fantasy/guides/...` | captain picks, transfer targets, differentials, deadline guide, scoring examples | Publish only from real BotolaGO data.                                        |
| Actualités Botola     | `/news`                       | original analysis, interviews, match previews, Fantasy implications              | Do not create one thin page per keyword variant.                             |

### First 20 page actions

This is an execution order, not a promise to create 20 new URLs.

1. Improve `/fantasy` with a crawlable explanation and direct “how it works” answer.
2. Improve `/fantasy/rules` with SSR-visible rules and worked scoring examples.
3. Improve `/fantasy/players` discoverability and player-detail links in raw HTML.
4. Improve `/fantasy/top-players` with completed-gameweek context.
5. Improve `/fantasy/fixtures` with a plain-language FDR explanation.
6. Improve `/matches` with season/round context and stable links.
7. Improve `/matches/standings` with a concise answer and methodology.
8. Improve `/clubs` with a league-directory introduction.
9. Add current-season club and match detail URLs to a scalable sitemap design.
10. Publish an original “Comment jouer à Fantasy BotolaGO” guide.
11. Publish an original points-scoring guide with real examples.
12. Publish a deadline and late-fixture handling guide.
13. Publish a captain-selection guide based on actual BotolaGO fixtures.
14. Publish a transfer-targets format driven by verified minutes and form.
15. Publish a differentials format with ownership methodology.
16. Publish a gameweek review using BotolaGO scoring data.
17. Add season context to the Wydad club page.
18. Add season context to the Raja club page.
19. Add season context to the FAR club page.
20. Add season context to the RSB Berkane club page.

The exact new-page order changes after real keyword and GSC data arrive.

## Module 5 — Results-page analysis and briefs

For every planned page, record:

- target query and observed intent;
- top five result types and headings;
- result features: live module, news box, video, forum, AI answer, People Also Ask;
- table stakes;
- missing angle BotolaGO can answer with its own data;
- one 40–60 word direct answer;
- source requirements;
- real screenshot, calculation, observation or dataset that must be supplied by a human or by BotolaGO's verified data.

Use `docs/seo/CONTENT_BRIEF_TEMPLATE.md`. Do not write the page before the brief identifies a genuinely useful edge.

The copyable instructions for this and every other workflow are in `docs/seo/BOTOLAGO_PROMPT_PACK.md`.

## Module 6 — Content that does not become scaled filler

### Editorial gate

Every indexable article must pass all of these:

1. The answer or news event is clear in the opening paragraph.
2. The page adds original reporting, analysis, a verified data table, a useful calculation, a direct quote with source, or a BotolaGO product insight.
3. Every factual claim that can change has a source or comes from an identified BotolaGO dataset.
4. The headline and metadata describe the page without clickbait.
5. The page links to the relevant club, match, player or Fantasy guide.
6. A licensed story identifies its source and original URL.
7. A human editor approves it.

Publishing 20 lightly rewritten stories each morning is not an SEO strategy. A smaller number of original, useful pieces plus the live product pages is safer and more defensible.

## Module 7 — On-page rules

- One H1 per URL.
- One self-canonical per indexable URL.
- A unique, descriptive title. Treat roughly 30–60 characters as a review trigger, not permission to cut off the named entity.
- A useful description, normally no more than about 155 characters. Rewrite; do not blindly clip.
- The primary question answered near the top.
- Descriptive internal-link anchors.
- Article JSON-LD only from real fields.
- SportsEvent for match pages, SportsTeam for club pages, breadcrumbs for entity detail pages.
- No FAQ schema merely to chase a rich result.
- Validate production output, not only React source.

## Module 8 — Technical audit

Run a safe sample:

```bash
bun scripts/seo/audit-site.ts --max=200 --concurrency=4 --output=seo-audit.csv
```

Run the full sitemap only intentionally:

```bash
bun scripts/seo/audit-site.ts --max=0 --concurrency=4 --output=seo-audit-full.csv
```

The script reads URL sets or sitemap indexes and records HTTP state, redirects, titles, descriptions, H1s, canonicals, robots, raw-HTML word count, language, JSON-LD types and response time. It also creates a JSON summary. It does not render JavaScript or replace Core Web Vitals, Search Console coverage, Rich Results Test or a full internal-link crawler.

Current priority checks:

- sitemap availability and URL count;
- accidental noindex or canonical drift;
- public pages that expose only loading copy before JavaScript;
- 404/503 correctness;
- duplicate or weak imported pages;
- a future sitemap split before protocol limits are approached.

## Module 9 — Internal linking

Required graph:

- article → every tagged club;
- club → current matches, standings context and relevant club news;
- match → both club pages and the competition table;
- Fantasy guide → rules, relevant player pages and the action it explains;
- player page → club, upcoming fixtures and related Fantasy guides;
- every cluster → its pillar, and every pillar → its important clusters.

The first code change in this programme converts each article's club chip into a real link to the canonical club page.

Anchor text should normally be the club, player or task name. Do not use “click here”.

## Module 10 — AI-search readiness

For an evergreen or analytical page:

1. Put a self-contained answer near the top.
2. Use question-shaped headings only where readers genuinely ask that question.
3. Give exact dates, gameweeks, scores and methodology.
4. Cite the official or original source.
5. Publish original BotolaGO tables or calculations when possible.
6. Keep club, player, competition and match entities linked and represented in structured data.

Test a fixed set of French and Arabic questions monthly. Record the answer, cited domains, BotolaGO citation status and what the cited source did better. `llms.txt` is optional and is not a substitute for any item above.

## Module 11 — Search Console growth loop

Export Search Console CSV files and run:

```bash
bun scripts/seo/analyze-search-console.ts \
  --queries=Queries.csv \
  --query-pages=QueryPages.csv \
  --pages=Pages.csv \
  --previous-pages=PagesPrevious.csv \
  --output-dir=seo-gsc-output
```

Outputs:

- `striking-distance.csv`: positions 8–20 with at least 100 impressions;
- `low-ctr-pages.csv`: pages in positions 1–5 materially below peers at a similar position;
- `content-decay.csv`: pages whose clicks fell by more than 30% versus the comparison export, including URLs missing from the current export (`current_export_status=missing`). Verify that both exports use matching filters and complete date ranges before treating a missing row as a true 100% loss;
- `summary.json`.

Run this monthly. The script never guesses which page ranks for a query: supply the combined query + page export to map it.

## Link acquisition without spam

The strongest realistic linkable assets are:

1. a transparent Botola Pro Fantasy points methodology and examples;
2. a current Botola fixture/rescheduling tracker;
3. a club and player data directory with clear update timestamps;
4. an original gameweek statistical review;
5. a reusable Botola Fantasy planner or captain comparison tool.

Likely linkers are clubs, supporter communities, sports journalists, Moroccan football creators and sponsors. Outreach must reference a relevant page and explain the reader benefit. Do not buy bulk links or send hundreds of generic messages.

## 30-day execution plan

| Days  | Work                                                                            | Exit condition                                                      |
| ----- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1–3   | Connect GSC; save the site brief and voice; take index/sitemap baselines        | Data source connected and baseline recorded                         |
| 4–7   | Run the audit; fix status, noindex, canonical, H1 and crawlable-content defects | No P0 technical defect in the sampled public routes                 |
| 8–12  | Pull real French and Arabic keyword data; classify intent and opportunity       | Quick-win, authority and later lists exist without invented metrics |
| 13–15 | Confirm topical map and URL ownership                                           | One target intent per page; no planned cannibalization              |
| 16–18 | Improve the five strongest existing pages                                       | Better direct answers, metadata and internal links deployed         |
| 19–28 | Publish two to four original evergreen or data-led pages                        | Every page passes the editorial gate                                |
| 29–30 | Re-crawl, inspect GSC, log AI citations and update priorities                   | New baseline and next-month queue recorded                          |

## Implementation started in this branch

- Added all public Fantasy discovery pages to the sitemap.
- Added missing canonicals and complete social metadata to legal and prize pages.
- Removed the duplicate H1 from the prize-rules route.
- Linked article club entities to canonical club pages.
- Added SportsTeam structured data to club pages.
- Added real article `about` entities for clubs, players and competitions.
- Added repeatable raw-HTML and Search Console analysis scripts.
- Added a BotolaGO-specific copyable prompt pack for research, briefs, drafting, editing, metadata, audits, links and reporting.
- Made the Fantasy rules explanation crawlable even while its live configuration is loading.

## Decisions that remain data-gated

- Whether old licensed archive pages stay indexed, are consolidated, or are excluded.
- Which French and Arabic keywords receive new standalone pages.
- Whether `/fr/` and `/ar/` route namespaces should replace the current local-preference language model. This needs a complete redirect, canonical and hreflang migration, not a partial rollout.
- Which pages deserve link-building effort.
- Traffic or conversion targets. Establish the baseline first.
