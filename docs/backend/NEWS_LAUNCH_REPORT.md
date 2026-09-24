# News launch report

Date: 2026-09-23. Follows [NEWS_CMS_ACTIVATION_AUDIT.md](NEWS_CMS_ACTIVATION_AUDIT.md)
(verdict then: NOT READY). Code merged in PR #158 (`6f9cdaf`).
`NEWS_ENABLED` is still `false` (`src/lib/feature-flags.ts`).

**Status: TECHNICALLY READY — WAITING FOR CONTENT**

---

## A. Fixed

| #   | Problem found in the audit                                                          | What changed                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "Programmé" saved a date but nothing ever published it                              | A database job runs every minute and publishes whatever is due, with no admin action. Each article is published once, with `published_at` = the scheduled time (UTC). A schedule in the past is refused. The editor shows the time in the editor's zone and in UTC, and can reschedule. The CMS list warns if the job stops, fails or falls behind.                           |
| 2   | 108 third-party stubs (GNews / ElBotola excerpts) could be published with one click | All 108 are archived, private and marked "Importé · non publiable". They are not deleted and stay searchable in the CMS ("Importés" filter). The only moves allowed are archive/unpublish. Publishing one needs an editorial admin to convert it first and give a written reason, which is audited. The public API refuses them even if their status is changed by hand.      |
| 3   | Links in articles                                                                   | Only `https://` and site-internal links are kept. `javascript:`, `data:`, `http:` and `//` links lose their target. External links get `target="_blank" rel="nofollow noopener noreferrer"`. No iframes or scripts. Images from other sites are still stripped.                                                                                                               |
| 4   | No sitemap, no robots rules, no language alternates                                 | `/sitemap.xml` lists only public, listed articles (never drafts, scheduled, unpublished, archived, unlisted or imported ones), and lists no News at all while News is off. `robots.txt` blocks `/admin`, `/auth` and `/profile`, and admin pages also send `noindex`. Each article has one canonical URL. fr/ar alternates appear only when the other language is public too. |
| 5   | Image upload function in production was out of date                                 | Production lacked the staff-permission pre-check and the "is this really an image" byte check. The repo version is now deployed (see B).                                                                                                                                                                                                                                      |
| 6   | Every CMS error showed "data_unavailable"                                           | Real reasons now show, in French or Arabic.                                                                                                                                                                                                                                                                                                                                   |
| 7   | Leaving the editor lost unsaved text                                                | Leaving through an in-app link, or closing the tab, now asks for confirmation.                                                                                                                                                                                                                                                                                                |
| 8   | No way to pair a French and an Arabic version                                       | "Créer la version arabe/française" links the two editions to the same story.                                                                                                                                                                                                                                                                                                  |
| 9   | Revision history could not be restored                                              | Restoring fills the form. Saving then creates a new revision, and nothing in the history is deleted.                                                                                                                                                                                                                                                                          |

## B. Production deployed (project `tkewgajrljbwgwedqsxn`)

| When (UTC)       | What                                                     | Result                                                                                                  |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 2026-09-22       | Edge function `news-media-upload` v6 (from repo)         | Read back; identical to repo                                                                            |
| 2026-09-22 22:09 | Migration `20260922220941 news_legacy_imports`           | 108 archived/private, 0 public, 108 → 216 revisions, 1 audit row                                        |
| 2026-09-22 22:12 | Migration `20260922221202 news_scheduled_publication`    | Two jobs active: `news-publish-due-editions` (every minute) and a daily clean-up. pg_cron 1.6.4 enabled |
| 2026-09-23 04:37 | Migration `20260923043708 news_public_seo`               | Sitemap data function live, returns `[]`                                                                |
| 2026-09-23       | Edge function `news-editorial-write` v6 (new link rules) | Read back; identical to repo                                                                            |

- Every migration was applied from the repo file unchanged. A dry run of the archive step was done first and rolled back.
- None of these writes overlapped a Fantasy orchestrator run. Its runs were at 22:05–22:06 and 00:28.
- The 11 database functions these migrations define match the repo exactly: a checksum of each function's source text was compared against the migration files, and there is one version of each.
- The live site (`botolago.com`) already serves the merged code: the new `robots.txt`, a sitemap with 6 non-News pages, admin `noindex`, and `/news` redirecting to the home page.

## C. Verified

**Automated (commit `7e0f6a0`; CI on PR #158: `application-quality` ✅, `database-quality` ✅)**

| Command                                                        | Result                                                                                                                                                   |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test`                                                     | 1570 pass, 0 fail (161 files)                                                                                                                            |
| pgTAP after a clean database reset                             | 1310 tests in 57 files, all pass. This includes 39 scheduling tests (the 7 required cases plus failure logging and health) and 23 imported-content tests |
| DB lint / types / migration check                              | clean; types current; 77 migrations valid                                                                                                                |
| `bun run build`, lint                                          | build OK; 0 errors (17 old warnings)                                                                                                                     |
| Anonymous browser run, FR + AR × 6 screen sizes                | 12 / 12                                                                                                                                                  |
| Authenticated CMS journey (editor, publisher, reader), FR + AR | 11 / 11                                                                                                                                                  |

**By hand on a full local copy of the stack (real database, real login with 2-step codes)**

- Permissions:
  - Visitor: refused.
  - Ordinary user: refused (403).
  - Editor without the 2-step code: refused.
  - Editor with the code: can write, upload and send for review, but cannot publish, schedule or convert.
  - Publisher: can publish, unpublish and schedule; a past date is refused.
- Uploads:
  - SVG renamed to .png: refused (415).
  - HTML renamed to .webp: refused (415).
  - Real SVG: refused (415).
  - 11 MB file: refused (413).
  - Missing alt text: refused (400).
  - Uploading straight to storage, skipping the function: refused.
- Content: saving without passing through the cleaning function is refused. A script hidden in an article body came out clean.
- Scheduling rehearsal (UI, real clock):
  - Scheduled for 19:22:00 UTC. The job started at 19:22:00.007, and the article was publicly readable at 19:22:09.
  - 1 publication and 1 audit entry. Over 53 job runs, 0 failed.
- Revision restore: 2 → 3 revisions; the replaced version was kept.
- Unsaved-changes prompt: "Des modifications non enregistrées seront perdues. Quitter la page ?"

**Production, read-only checks after deployment (2026-09-23 04:37 UTC)**

| Check                                                                                                                  | Result                                   |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Articles public                                                                                                        | 0 (all 108 editions archived/private)    |
| `news_feed` fr / ar as a visitor                                                                                       | no items / no items                      |
| An archived stub by id                                                                                                 | 404 `news_article_not_found`             |
| `news_sitemap_entries` as a visitor                                                                                    | `[]`                                     |
| Schedule job                                                                                                           | active, last run 04:37:00, 0 failed runs |
| CMS functions as a visitor (`editorial_list_stories`, `editorial_schedule_health`, `editorial_convert_imported_story`) | permission denied                        |
| Both edge functions without login, or with the public key only                                                         | 401                                      |

**Test limits**

- The local Supabase edge runtime would not start in this sandbox. Locally, a small Bun server ran the same shared handler code; the real Deno runtime was not used.
- Staging (`srdrflfrfpwixsllveid`) was not used: it has no edge functions and no staff, and it has drifted (unmerged News-engine migrations plus one published machine-written story).
- The production functions were checked only for refusals, not with a logged-in editor, because production has no QA accounts (see D).

## D. Remaining blockers

None in the code. What remains is owner work:

1. **Production CMS accounts.** Production has one staff account (the owner's). To check the real CMS in production before launch, create an Editor and a Publisher in Admin → Staff. Both need 2-step login. Give the Editor only `editorial.write`, and the Publisher `editorial.write` and `editorial.publish`.
2. **Launch content.** No real articles exist yet (see E).

**Not blockers, but worth knowing:**

- The ElBotola and GNews import jobs are off (schedules commented out, manual runs only). If run, their output is marked imported and cannot go public unless an editorial admin converts it.
- PR #155 (the News engine) is separate. Its migrations do not collide with these. Its stories are not treated as imported.

## E. Content required

Use [NEWS_LAUNCH_CONTENT_CHECKLIST.md](NEWS_LAUNCH_CONTENT_CHECKLIST.md):

- 3–5 real stories, each in French and Arabic, written or approved by a named person.
- Each cover image needs confirmed rights (own photo or licensed) and alt text.
- Sources are checked, and outside links are `https` only.
- No invented news, no copied third-party text, no third-party photos without rights.

## F. Launch procedure

1. Create the two production CMS accounts (D1) and sign in with each once.
2. Enter the stories as drafts. Send them to review. Have the Publisher check the preview in both languages.
   - While News is off, keep them as drafts or in review. Anything published is readable through the public data API even before the site shows it.
3. On launch day, in one window:
   - Set `NEWS_ENABLED = true` in `src/lib/feature-flags.ts` via a PR and deploy it.
   - Then publish the stories, or schedule them a few minutes ahead.
4. Check:
   - `/news` in FR and AR.
   - Each article page.
   - `/sitemap.xml` now lists the articles.
   - In the CMS list, no schedule warning.
5. Submit `https://botolago.com/sitemap.xml` in Google Search Console.

## G. Rollback

Fastest first:

1. **Hide News:** set `NEWS_ENABLED = false` and redeploy. Pages, links and sitemap entries disappear. The data is untouched.
2. **Take an article down:** "Dépublier" in the CMS. It stops being public immediately.
3. **Stop automatic publishing:** run `select cron.unschedule('news-publish-due-editions');` in production. Scheduled articles then stay private until published by hand. To resume, re-apply the job line from migration `20260922180100`.
4. **Edge functions:** `news-editorial-write` v5 is the version before PR #158 in git; redeploying it only reverts the link rules. Do not roll `news-media-upload` back: its previous version (v5) lacked the file-type check.
5. **The database changes are forward-only.** Do not delete the migrations. The 108 archived stubs keep their full history. An editorial admin can convert one if it should ever be published.

## H. Switched on (2026-09-24)

The owner switched News on after the licensed ElBotola import (14,194 stories, 15,690 editions, published with ElBotola's own dates, SEO title and description on every edition).

- `NEWS_ENABLED = true`.
- **Owner decision:** licensed articles are indexed like BotolaGO's own. The `noindex` on licensed pages is removed. They still show "Source : ElBotola" / "المصدر: البطولة" and carry JSON-LD `isBasedOn`.
  - When offered, the owner declined the alternative of pointing each page's canonical at ElBotola.
  - **Known risk:** Google may treat a large archive of republished articles as duplicate content and rank the whole site lower.
  - **To reverse:** restore the `noindex, follow` line in `src/lib/article-meta.ts`, and the publisher filter in `api.news_sitemap_entries`.
- **Sitemap.** Migration `20260924163000_news_sitemap_licensed.sql`:
  - lists licensed publishers' stories;
  - rewrites `api.news_sitemap_entries` so it runs as one set-based query. The old per-row version took ~13 s on the archive; anon's statement timeout is 3 s.
  - adds two partial indexes. With them the new query takes ~0.2 s, measured in a rolled-back transaction on production data. It returns the same 15,690 editions.
  - `/sitemap.xml` now asks for up to 50,000 entries.
