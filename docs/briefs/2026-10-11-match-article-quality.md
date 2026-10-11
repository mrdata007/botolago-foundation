# Match article quality and Arabic article fallback (2026-10-11)

Approved by the owner on 2026-10-11. Branch `claude/match-article-quality`.

## Found (read-only QA of a live auto-written match report)

1. The report on Amal Tiznit 2-5 Difaâ El Jadida (a league match) says the
   half-time score "n'a pas été communiqué" and mentions "tirs au but".
2. In Arabic mode the article page shows the French body, and the browser logs
   a 404 from `news_article_detail`.

## Preserve

- Match-report facts rule: write only from supplied facts, never invent a
  score; the `inventedScores` guard.
- `PUBLIC_EDITORIAL_RULE` and the AI-notice guard (`containsPublicAiNotice`).
- Both languages publish together in one transaction; the cap and switch.
- The article page layout, the `lang`/`dir` on the article body, hreflang
  translation links, and the client fallback in `getArticleWithLanguageFallback`
  (kept as a safety net).
- No visible interface change: no markup or styling is touched.

## Improvements

- The model is no longer sent null facts. A half-time or shoot-out score that
  is not known is dropped from the input, and the prompt forbids remarks about
  missing information.
- A new guard, `unsupportedMentions`, rejects (French and Arabic) any remark
  that information is missing or unknown, and, for match reports, a penalty
  shoot-out or extra time unless the facts carry a shoot-out score. A rejected
  article is not published; the job comes back on the next run.
- `api.news_article_detail`, given an edition id from the other language,
  returns the reader's own-language edition of that story when one is public,
  otherwise the named edition. No more 404 in the console (migration
  20261011170000).

## Acceptance criteria

- Unit tests: a recap with null half-time/shoot-out facts sends none of them to
  the model; the guard rejects the phrases in FR and AR; a real shoot-out
  (score in the facts) is allowed; previews are not affected.
- `bun run typecheck`, `bun run lint`, prettier check and the touched tests pass.
- pgTAP: an edition id in the other language resolves to the sibling edition,
  or to the named edition when there is no sibling; slugs and unknown ids are
  still not found. (CI `database-quality` is the authority.)
- Arabic article page: no failed `news_article_detail` request; the body keeps
  correct `lang` and `dir`.
- Existing published articles are not edited by this change.
