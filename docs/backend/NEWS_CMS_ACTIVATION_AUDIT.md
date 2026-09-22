# News CMS activation audit — 2026-09-22

Branch `claude/botolago-news-cms-audit-vuuro8`, started from `main` at
`de0ed68`. `NEWS_ENABLED` is still `false` and was not touched.

## 1. Verdict

**NOT READY.**

The editor, permissions, sanitising and public read path are mostly sound, and
eight real defects are now fixed on this branch. News still cannot be switched
on because:

1. **"Programmé" (scheduled) never publishes anything.** It only stores a date.
2. **There is no approved launch content.** Production holds zero original
   articles; the only rows are the 108 stood-down link stubs.
3. **Nobody has run the editor end to end against a real backend.** Staging has
   no Edge Functions and no staff accounts; production has exactly one staff
   account (the owner's). No QA editor account exists anywhere.
4. **French/Arabic SEO is incomplete:** no hreflang, no sitemap, no
   `robots.txt`.
5. **Production is running an older upload function** than the repository.
6. **Any publisher can re-publish a stood-down link stub with one click.**

## 2. What exists and whether it works

"Verified" means I ran it and saw the result. "Code-read" means I read the code
but could not execute it end to end. Environments: **L** = private local
database built from every migration in this repo; **P** = production, read-only
queries; **S** = staging, read-only queries; **B** = local browser run.

| Capability                                       | Status                                  | Evidence                                                                    | Env     | Remaining risk                                                                                              |
| ------------------------------------------------ | --------------------------------------- | --------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| Admin gate on `/admin/news*`                     | Verified (code + unit)                  | Server function `loadAdminRouteAccessForPermission`, `route-access.test.ts` | L       | Not exercised in a browser with a real session                                                              |
| DB authorization (editor / publisher / MFA aal2) | Verified                                | pgTAP `news_editorial_lifecycle`, `news_editorial_admin_bridge`, `news_rls` | L       | —                                                                                                           |
| Draft create / save                              | Verified at DB level                    | pgTAP lifecycle + new `news_editorial_schedule_and_conflict`                | L       | Browser path unexercised                                                                                    |
| Server-side HTML sanitising (HMAC-proof)         | Verified                                | pgTAP + `news-editorial-write.test.ts`; deployed P function matches repo    | L, P    | —                                                                                                           |
| Markdown headings / bold / lists                 | **Was broken, fixed**                   | `9c4c63d`                                                                   | L       | —                                                                                                           |
| Save after any status change                     | **Was broken, fixed**                   | `d90b052`; pgTAP proves the stale token is refused                          | L       | —                                                                                                           |
| Cover upload                                     | Code-read + unit                        | `news-media-upload.test.ts` (18 tests)                                      | L       | P runs an older build (see §8 step 4)                                                                       |
| Cover alt / caption / credit                     | **Was missing, fixed**                  | `b9e6a87`                                                                   | L       | Cannot be edited after upload; re-upload instead                                                            |
| Upload checks real file bytes                    | **Was missing, fixed**                  | `e37968a`                                                                   | L       | Needs redeploy; image dimensions still client-reported                                                      |
| Body image insert                                | Code-read + unit                        | `editorial-markdown.test.ts`                                                | L       | Body images have no separate credit field                                                                   |
| Off-site (hotlinked) images                      | **Was open, fixed**                     | `d352aa3`                                                                   | L       | —                                                                                                           |
| Preview                                          | Code-read                               | Uses the same `.editorial-body` class as the public page                    | —       | Preview omits the cover image                                                                               |
| Review → publish → unpublish                     | Verified                                | pgTAP lifecycle                                                             | L       | —                                                                                                           |
| Scheduling                                       | **Stores a date only; never publishes** | §4                                                                          | L, P, S | Launch blocker                                                                                              |
| Revision list                                    | Works                                   | —                                                                           | —       | —                                                                                                           |
| Revision restore                                 | **Was missing, added**                  | `c38827e`                                                                   | L       | No "who" (user id only), no SEO/cover in snapshots                                                          |
| Linked FR/AR editions                            | **Was impossible from the CMS, added**  | `35e62ae`; pgTAP                                                            | L       | Public page cannot yet switch language or emit hreflang                                                     |
| Public feed / article / related                  | Verified at DB level                    | pgTAP; related = same language, public only, max 12                         | L       | —                                                                                                           |
| Drafts / review / scheduled never public         | Verified                                | pgTAP (incl. scheduled after its time)                                      | L       | —                                                                                                           |
| Canonical URL                                    | **Was inconsistent, fixed**             | `d9cf0bd`                                                                   | L       | —                                                                                                           |
| OG / Twitter / JSON-LD                           | Unit-verified                           | `article-meta.test.ts`                                                      | L       | Not measured in rendered HTML with a real article                                                           |
| hreflang                                         | **Missing**                             | No code emits it                                                            | —       | Blocker for bilingual SEO                                                                                   |
| Sitemap / robots.txt                             | **Missing**                             | Neither exists                                                              | —       | Blocker for SEO                                                                                             |
| Autosave                                         | **Does not exist**                      | Manual save + leave-page warning only                                       | —       | See §5                                                                                                      |
| Feature flag gating                              | Verified                                | `feature-flags.test.ts`; browser run of `/news`                             | L, B    | —                                                                                                           |
| Ingestion / news engine                          | Intentionally stood down                | `20260921170000_news_stand_down.sql`                                        | P       | Staging carries unmerged `news_engine_*` migrations and one published machine-written Arabic transfer story |

## 3. Workflow evidence

| Step                       | Result                                                                                                                                                                                                                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin authorization        | DB: editor can draft and move to review but cannot publish; publisher can publish; no staff row, no MFA factor, or aal1 session → refused. Upload function refuses non-staff before reading the file (repo version). **Not run in a browser with a real login** — no QA account exists.              |
| Draft creation             | DB-verified (pgTAP).                                                                                                                                                                                                                                                                                 |
| Save and reload            | DB-verified. The editor re-reads `editorial_get_article` on load, so all saved fields come back.                                                                                                                                                                                                     |
| Save after a status change | **Failed before this branch** (false "modified elsewhere"). pgTAP now proves the old token is refused (40001) and the re-read token works. Fixed in the editor.                                                                                                                                      |
| Cover upload               | Unit-verified against the handler; not run against a real bucket.                                                                                                                                                                                                                                    |
| Body image                 | Unit-verified. Caption = alt text.                                                                                                                                                                                                                                                                   |
| Preview                    | Code-read.                                                                                                                                                                                                                                                                                           |
| Review → publish           | DB-verified.                                                                                                                                                                                                                                                                                         |
| Scheduled publication      | **Does not happen.** See §4.                                                                                                                                                                                                                                                                         |
| Public feed / full article | DB-verified: feed and detail return only `published` + public editions; body HTML is returned in full, so full articles (with our own body images) are readable inside BotolaGO.                                                                                                                     |
| Unpublish / archive        | DB-verified: disappears from the feed and article read immediately. The database read is live; the browser's query cache refreshes on the next load; this repo configures no CDN cache (`vercel.json` has none). Not measured on the deployed site.                                                  |
| French / Arabic            | DB-verified: an Arabic draft joins the French story; a second edition in the same language is refused; publishing French leaves Arabic private. RTL: editor fields, preview and public article set `dir` from the article's language (code-read); browser acceptance passed in Arabic at six widths. |

Browser: `tests/e2e/anonymous.acceptance.e2e.ts` — **12 passed**
(FR + AR × 320/375/390/430/tablet/desktop), including `/news`, which redirects
to Home while the flag is off.

No QA content was written to production or staging. All QA rows lived in the
private local database and were removed.

## 4. Scheduling verdict

**Scheduling only saves a status. It does not publish.**

- Choosing "Programmé" stores `status = scheduled`, `scheduled_at` (UTC) and
  sets visibility to public. The public read rule requires
  `status = published`, so the article stays hidden.
- **Nothing ever changes `scheduled` to `published`.** There is no database
  function, cron job, Edge Function or GitHub Action that does it. Production
  and staging do not have `pg_cron` installed at all.
- Controlled run (local DB, real clock):

  | Item                  | Value                                                                         |
  | --------------------- | ----------------------------------------------------------------------------- |
  | Requested time        | now + 90 s                                                                    |
  | Stored `scheduled_at` | 2026-09-22 18:10:04 UTC                                                       |
  | Worker invocation     | none exists                                                                   |
  | Checked at            | 18:12:13 and 18:12:16 UTC                                                     |
  | Result                | still `scheduled`, `published_at` empty, not in feed, article URL = not found |
  | Delay                 | unbounded — it never publishes                                                |

- Also found: the server accepts a `scheduled_at` in the past (only the editor
  UI checks it); the editor never shows the time an article is scheduled for;
  rescheduling requires scheduled → draft → review → scheduled. Leaving
  `scheduled` does clear the date, so a cancelled schedule cannot fire later.
- Timezone: the editor's date field is the browser's local time, converted
  with `toISOString()` to UTC; storage and comparison are UTC. Morocco's
  Ramadan clock change is handled by the browser's timezone data. This is only
  meaningful once something publishes.

What is needed (owner choice, §8): either a publishing job — a small database
function that moves due `scheduled` rows to `published` using the existing
transition rules, run every minute by `pg_cron` or an external scheduler — or
hide "Programmé" for launch.

## 5. Genuine gaps

**Direct answers**

- Autosave: **no.** Saving is manual. A leave-page warning fires on refresh or
  tab close with unsaved changes. In-app navigation (e.g. the "Tous les
  articles" link), session expiry, network loss and a phone killing the tab all
  lose unsaved text.
- Can a revision be restored: **now yes**, for title, subtitle, summary and
  body (loaded into the editor, then saved normally). Not for SEO fields or
  cover. "Who" shows no name.
- Are scheduled articles published automatically: **no.**
- Are FR/AR SEO outputs complete: **no.** Title, description, canonical, OG,
  Twitter and JSON-LD are built per edition. hreflang, sitemap and
  `robots.txt` are missing, and the public page has no way to find the other
  language edition.
- Can full articles with body images be read publicly: **yes**, when the
  images are uploaded through the CMS. Off-site images are now removed.

**Launch blockers**

1. Scheduling does not publish (or must be hidden).
2. No approved launch content.
3. No end-to-end run with a real editor login (needs a QA editor account on a
   backend with the Edge Functions deployed).
4. Production `news-media-upload` is older than the repo (missing the staff
   pre-check and the new byte check).
5. hreflang + sitemap + `robots.txt`.
6. The 108 stood-down stubs can be re-published with one click and clutter the
   CMS list.
7. Links: editors cannot add links, and the public page strips every link
   (BG-0091). Decide whether original articles may link out.

**Important after launch**

- Autosave (or at least a local draft backup) and an in-app "unsaved changes"
  guard on navigation.
- Show the scheduled time in the editor and the list.
- Slug cannot be edited in the editor (only set at creation); no redirects.
- No author selection, so articles have no byline and JSON-LD has no author.
- Edit cover alt/caption/credit without re-uploading.
- Strip photo metadata (EXIF/GPS) on upload.
- Missing article pages return HTTP 200 (now `noindex`).
- Revision "who" and SEO/cover in snapshots.

**Optional**

- Formatting toolbar buttons for the Markdown markers.
- Character counters on title and summary (SEO fields already have them).

## 6. Changes made

| Commit    | File(s)                                                     | Reason                                                                           | Test added                                                                         |
| --------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `9c4c63d` | `src/backend/news/editorial-markdown.ts`, both editor hints | `##`, `**`, lists and quotes came out as literal characters                      | 12 cases in `editorial-markdown.test.ts`                                           |
| `d90b052` | `src/backend/news/editorial-session.ts`, editor route       | First save after any status change failed as a conflict                          | `editorial-session.test.ts`; pgTAP `news_editorial_schedule_and_conflict.test.sql` |
| `b9e6a87` | editor route, `src/services/news.ts`                        | Cover alt was the headline; caption/credit never sent and always erased publicly | `admin.news.editor-media.test.ts`; 2 cases in `news.test.ts`                       |
| `e37968a` | `supabase/functions/_shared/news-media-upload.ts`           | Any bytes accepted if labelled as an image                                       | 7 cases in `news-media-upload.test.ts`                                             |
| `d9cf0bd` | `src/lib/article-meta.ts`                                   | Two canonicals per article; missing article indexable                            | 2 cases in `article-meta.test.ts`                                                  |
| `d352aa3` | `src/services/news.ts`                                      | Editors could publish hotlinked third-party photos                               | 4 cases in `news.test.ts`                                                          |
| `c38827e` | `editorial-session.ts`, editor route                        | No way to restore a revision                                                     | 5 cases in `editorial-session.test.ts`                                             |
| `35e62ae` | `admin.news.new.tsx`, editor route, `editorial-session.ts`  | FR/AR editions could not be linked                                               | 4 unit cases; 3 pgTAP cases                                                        |

No migration was added. No database was written to except the private local
one. `NEWS_ENABLED`, ingestion, Fantasy and scheduling infrastructure were not
changed.

## 7. Checks run on the final branch

| Command                                                 | Result                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `bun run typecheck`                                     | pass                                                                   |
| `bun run lint`                                          | 0 errors, 17 warnings (same 17 as `main`)                              |
| `bun test`                                              | **1529 pass, 0 fail, 160 files** (`main`: 1483 / 158)                  |
| `bun run backend:db:test` (local)                       | **55 files, 1251 tests, PASS** (`main`: 54 / 1236)                     |
| `bun run backend:db:lint`                               | no schema errors                                                       |
| `bun run backend:migrations:check`                      | 74 migrations valid                                                    |
| `bun run backend:types:check`                           | types current                                                          |
| `bun run backend:secrets:check`                         | no secrets                                                             |
| `bun run config:integrity:check`                        | no violations                                                          |
| `bun run build`                                         | success                                                                |
| `playwright test tests/e2e/anonymous.acceptance.e2e.ts` | 12 passed (with `E2E_CHROMIUM_PATH` set to the pre-installed Chromium) |

Not run: an authenticated Admin browser run and the `news-hero-fallback`
browser test — both need real published articles and a real login. No separate
accessibility tool was run; the editor fields use the kit's labelled inputs.

## 8. Activation runbook

1. **Content.** At least three original, human-approved stories, each with
   cover (owned or licensed), alt text, caption, credit, SEO title and
   description; Arabic editions created with "Créer l'édition arabe"; one
   chosen as lead (`news_lead`/`home_lead` placement after publishing). No
   placeholder, copied or unverified injury/transfer claims.
2. **Roles.** Create a separate editor account and a separate publisher account
   (Admin staff roles `editor` and `publisher`), each with MFA enrolled. Do not
   use the owner account for QA.
3. **Infrastructure.** Decide scheduling (§4). If building the job: add it as a
   reviewed migration and schedule it; otherwise hide "Programmé".
4. **Deploy functions and migrations.** Merge this branch. Redeploy
   `news-media-upload` and `news-editorial-write` to production from `main`.
   Promote any new migration through
   `docs/backend/RELEASE_ACTIVATION_MIGRATION_RUNBOOK.md`.
5. **Rehearse on a matching backend.** Deploy the two functions to staging,
   bring staging to parity with `main`, and run the full editor flow with the QA
   accounts: draft, save, reload, cover, body image, preview, review, publish,
   unpublish, FR + AR, and a real scheduled publication if built.
6. **Backup point.** Take a production backup / note the point-in-time restore
   timestamp immediately before step 7.
7. **Flag.** Change `export const NEWS_ENABLED = false;` to `true` in
   `src/lib/feature-flags.ts` (one line). `feature-flags.test.ts` must still
   pass.
8. **Build and deploy** the frontend.
9. **Smoke test in production:** `/news` lists only the approved stories;
   `/news/<id>` shows the full article, cover, caption, credit and body images;
   Home rail, Fantasy rail, match page related news and Profile saved count
   work; no stub appears; view page source for title, description, canonical,
   OG and JSON-LD.
10. **Monitor** Edge Function logs for `news-editorial-write` /
    `news-media-upload` errors and the API logs for `news_*` 4xx/5xx for the
    first day.
11. **Rollback:** set `NEWS_ENABLED` back to `false`, rebuild, deploy (every
    entry point redirects to Home again). If a specific article is the problem,
    unpublish it in the CMS — it leaves the public read path immediately.

## 9. Owner decisions

1. **Scheduling for launch:** build the publishing job, or hide "Programmé"?
2. **The 108 stubs:** archive them (and/or block publishing of
   provider-sourced stories), or keep them re-publishable for possible
   licensing?
3. **Links in original articles:** may editors link to other sites? Today the
   public page removes every link.
4. **QA accounts:** approve creating one editor and one publisher test account
   with MFA, and say on which backend.
5. **Launch stories:** supply or approve the three to five stories.
