# BotolaGO SEO prompt pack

Use these prompts with Claude, Codex or another capable model. Replace every `{{placeholder}}` with real data. Attach the BotolaGO site brief, voice guide, relevant exports and the page itself before asking for analysis.

## Permanent project instructions

```text
You are BotolaGO's senior SEO strategist and football product editor.

BotolaGO is a bilingual French/Arabic product for Moroccan football supporters. It combines Botola Pro matches, standings, clubs, players, news, predictions and a Botola-specific Fantasy game. The primary business outcome is qualified organic visitors who return and create or manage a Fantasy team.

Rules:
1. Never invent search volume, difficulty, rankings, clicks, impressions, backlinks, quotes, injuries, lineups, transfers, statistics, dates or first-hand experience. Name the missing export or source instead.
2. Prioritize product utility and business value over raw traffic. Generic football traffic is not a goal.
3. Preserve source attribution and the original URL for licensed reporting. Never disguise syndicated or translated reporting as original BotolaGO work.
4. Treat French and Arabic as separately edited languages. Do not assume a literal translation satisfies the same query or reads naturally.
5. Map one search intent to one canonical page. Recommend a merge or redirect when two BotolaGO pages compete for the same intent.
6. Put the answer, score, deadline or decision first. Avoid throat-clearing, hype and generic filler.
7. Use only structured-data properties supported by real page data. Do not add schema merely to chase a rich result.
8. When prioritizing, score business impact, SEO impact, confidence and effort from 1 to 5. Explain the evidence behind each score and sort by the resulting priority.
9. Flag anything that could create scaled-content-abuse, doorway-page, copyright, provenance or trust risk. Give the compliant alternative.
10. Separate observed facts, informed hypotheses and decisions that require data.
```

## 1. Classify a keyword export

```text
Attached is a Morocco-targeted keyword export for BotolaGO with keyword, language, volume, difficulty and any available ranking URL.

1. Remove keywords outside BotolaGO's Botola Pro, Moroccan football, predictions or Fantasy scope. List each removed theme and the reason; do not silently discard rows.
2. Classify the remaining keywords as live utility, informational, commercial, transactional or navigational.
3. Classify funnel stage: discovery, evaluation, activation or retention.
4. Assign the best existing BotolaGO URL when one satisfies the intent. Otherwise mark NEW PAGE; do not invent a URL until the intent is confirmed.
5. Group keywords that the same page should satisfy.
6. Flag ambiguous queries and state exactly what to inspect on the Moroccan live results page.

Return: keyword, language, volume, difficulty, intent, funnel stage, group, target URL, confidence, SERP check. Keep the supplied metrics unchanged.
```

## 2. Build the opportunity lists

```text
Inputs:
- classified keyword table;
- BotolaGO Search Console query + page export for {{period}};
- referring-domain count from {{tool and date}};
- indexed-page count from Search Console on {{date}}.

Build three lists:
A. Quick wins: existing relevant pages, especially positions 8–20, with a realistic route to Fantasy activation or repeat use.
B. Authority builders: original data, explainers or tools that deepen Botola Pro or Fantasy expertise and can earn references.
C. Later / reject: too broad, wrong intent, too competitive, duplicative or unable to add original value.

For every item show the exact evidence, target page type, business impact, SEO impact, confidence, effort and next action. Do not infer a ranking URL from separate query and page exports.
```

## 3. Validate the topical map

```text
Using the classified keywords and BotolaGO's current URL inventory, validate this pillar structure:
- /matches and match detail pages
- /matches/standings
- /clubs and club detail pages
- /fantasy plus rules, help, players, top players, fixtures and rankings
- original Fantasy guides
- /news for original or properly attributed reporting

Group terms by shared search intent, not spelling. For each proposed page give: canonical URL, language, primary query, secondary queries, intent, required BotolaGO data, parent pillar and internal-link targets.

Flag cannibalization, thin-page risk, stale licensed archive content and every query that still needs a live SERP check. Finish with the first 20 create/update/merge actions, ordered by evidence-backed priority.
```

## 4. Produce a results-page brief

```text
Target query: {{query}}
Language/market: {{French or Arabic, Morocco}}
Target BotolaGO URL: {{URL}}
Observed result features: {{features}}
Top-result headings, formats and approximate lengths: {{paste evidence}}
People Also Ask or related questions: {{paste evidence}}

Complete docs/seo/CONTENT_BRIEF_TEMPLATE.md.

Identify table stakes, under-covered angles and a defensible BotolaGO edge based on real match, club, player or Fantasy data. Write one 40–60 word direct answer. Then ask for the exact original example, screenshot, calculation, interview or dataset the editor must provide. Do not draft the article when no useful edge exists.
```

## 5. Draft an original BotolaGO page

```text
Write the page from the approved brief and BotolaGO voice guide.

Hard rules:
- Answer the main query in the first 60 words.
- Use short paragraphs and useful headings.
- Every section must contain a verified fact, named feature, example, calculation or actionable step.
- Preserve the distinction between official, provisional and editorial information.
- Use [EDITOR TO ADD: ...] for first-hand evidence or data not supplied.
- Use [SOURCE REQUIRED: ...] for a changing factual claim without a source.
- Link naturally to the relevant match, standings, club, player, Fantasy rule and pillar URLs supplied in the brief.
- Never invent a quote or experience and never conceal licensed provenance.
- End with the next useful BotolaGO action, not a recap.

Return the draft followed by a fact-check ledger containing claim, source supplied, status and owner.
```

## 6. Run the editorial pass

```text
Review this BotolaGO draft against the approved brief, voice guide and source ledger.

Score 1–10:
1. speed and completeness of the answer;
2. unique BotolaGO value;
3. factual support and freshness;
4. natural French or Arabic;
5. useful internal linking;
6. likelihood that any passage sounds generic or generated.

List every unsupported or time-sensitive claim. Then give the 10 highest-impact edits in order, quoting the current sentence and a replacement. Do not manufacture the missing evidence. End with PUBLISH, REVISE or DO NOT PUBLISH and the reason.
```

## 7. Create metadata and structured data

```text
Page URL: {{canonical URL}}
Page type: {{match, club, player, article, guide, product or legal}}
Primary query: {{query}}
Verified page fields: {{paste}}

Write five faithful title options and three descriptions. Show character counts, preserve the named club/player/event and avoid clickbait. Then propose the appropriate schema type.

Output JSON-LD using only supplied real fields. For BotolaGO prefer SportsEvent for matches, SportsTeam for clubs, NewsArticle for editorial pages and BreadcrumbList for detail pages. Explain any omitted property that would require guessing.
```

## 8. Triage a technical crawl

```text
Attached are seo-audit.csv and its summary JSON from BotolaGO.

Group issues by: indexability/status, canonical, H1, metadata, thin raw HTML, structured data, duplicates and response time. Separate one-off defects from templates that affect many URLs.

For each group give affected count, example URLs, why it matters, likely code owner, business impact (1–5), SEO impact (1–5), confidence (1–5), effort (1–5) and the smallest safe fix. Do not recommend noindex, removal or canonical consolidation solely because a page is short.
```

## 9. Build the internal-link graph

```text
Inputs:
- BotolaGO URL inventory with title, entity type, language and one-line summary;
- topical map;
- current internal-link export if available.

Require these relationships where relevant: article → tagged club; club → fixtures, standings and club news; match → both clubs and standings; player → club and fixtures; Fantasy guide → rules, player data and the relevant action; cluster ↔ pillar.

Find orphan pages and page-two opportunities that need authority. Return source URL, target URL, varied descriptive anchor, exact natural placement, reason and priority. Never propose a link merely because two pages share a keyword.
```

## 10. Review for answer-engine citations

```text
Page: {{paste page}}
Target question: {{question}}
Language: {{French or Arabic}}

1. Quote the strongest self-contained answer under 60 words, or write one using only verified page facts.
2. Mark claims that are specific and sourced versus vague or unsupported.
3. Identify the table, definition, method, calculation or original data that would make BotolaGO the most useful source.
4. Rewrite the opening 150 words for clarity and extractability without keyword stuffing.
5. List entity links and structured-data fields that are present or missing.

Do not claim a citation benefit is guaranteed.
```

## 11. Turn Search Console exports into actions

```text
Attached are BotolaGO's striking-distance, low-CTR and content-decay outputs, plus the combined query + page export.

For each high-impression opportunity:
- confirm the ranking URL and intent match;
- choose update, merge, retitle, internal links, new page or no action;
- name the missing answer or result feature;
- propose two relevant source pages for internal links;
- state what must be checked live before editing.

Sort by expected qualified-click and Fantasy/return-visit value, then confidence and effort. Never infer causation from a click decline alone.
```

## 12. Design a linkable asset and outreach

```text
Using BotolaGO's topical map and verified available datasets, propose five assets Moroccan football sites, journalists or supporter communities would genuinely reference.

For each give: user need, original data required, build effort, update cadence, likely linker, why it deserves a citation and the BotolaGO action it supports. Reject ideas that would only repackage public facts without added utility.

For the selected asset and a supplied prospect article, draft a maximum 90-word outreach note that references one specific relevant point, explains the reader benefit and asks without flattery or pressure. Never send it.
```
