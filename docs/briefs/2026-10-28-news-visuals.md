# News visuals: data-drawn thumbnails, useful tags, current clubs (screen brief)

Owner-approved on 2026-10-28 ("everything listed", design critique follow-up).
Branch `claude/dc-news-visuals`. Scope: `/news`, `/news/archive`, `/news/$articleId`
and the shared `ArticleCard` / `ArticleHeroFallback` they use (so Home, a club page
and a match page pick the card change up without edits of their own).

Open PRs checked first: #375 (Morocco-time news dates) edits `news-data.ts` and
`services/news.ts` for date formatting only, no overlap with this work; #471
(match photo edits) and #552 (real Arabic articles) touch no news card or plate
file. Nothing is duplicated.

## What must be preserved

- The card shapes and variants (`lead`, `imageLed`, `horizontal`, `row`, `compact`),
  the 4px club edge, Save over the thumbnail, the press feedback, and the
  heights and aspect ratios of every thumbnail box (no layout shift).
- Real editorial images: an article with its own picture still shows it. The new
  plate only replaces the stock-photo fallback.
- Licensed news keeps its source credit and link (article page `article-source`).
- The category chips as the taxonomy fills them, the follow control, the URL as
  the owner of the filters, keyset pagination, the archive link.
- Club colours come only from the club-palette helpers (`clubMatchPalettes`,
  `clubStyle`), so the contrast rules and the home/away clash rule hold.
- Business rules, Morocco time, French and Arabic (RTL), no player photos, no new
  image files, no text baked into images.

## Improvements

1. **Thumbnails drawn from data (main item).** About three stock photos stood in
   for every article without a picture (an empty stadium, a goal net). Now, when
   an article has no real image of its own:
   - two clubs: the match header's split, two club-colour halves with crest
     discs and, when the article can be tied to a fixture, the final score
     (result) or the kick-off time in Morocco time (preview);
   - one club: a club-colour plate with its crest;
   - no club: the existing category plate, unchanged.
     The fixture is inferred, not stored: both clubs of the article play a fixture
     of the current season whose kick-off lies within four days after / three days
     before the article's publication; the nearest one wins. The card carries no
     fixture id (the API does not send one), so this is the honest reading of the
     data we have. No score or time is drawn when no fixture matches.
2. **A tag that says something.** "Dernières actualités" on every card was the
   category's label (every article is `latest`). The tag is now, in order: the
   editorial tag; "Avant-match" / "Résultat" when the article is tied to a fixture
   as above; a specific category (Mercato, Analyses, Interviews); the club's name
   for a one-club article; otherwise no tag. The generic categories (`latest`,
   `for_you`) never show as a tag. The photo card's pill is dropped when there is
   no tag. "Dernières actualités" is no longer a filter chip (it meant "Tous").
3. **Club filter.** Current-season clubs only (the Clubs page's directory),
   in a single sideways-scrolling line on every width; former clubs and the
   placeholder "Yacoub El Mansour" chip are gone from the row.
4. **"GMT" in article text.** Not a frontend template: the text is stored article
   copy written by the content generator. Source reported to the orchestrator
   (no data or function changed here).

   **Thumbnail layout and mirroring.** On the 88x68 row thumbnail the Save
   control keeps the top end corner; the crests and the figure sit in one
   scoreboard strip along the bottom (home crest, figure, away crest), so the
   two never overlap (measured as box intersections at 320 / 390 / 1440, FR and
   AR, light and dark). Home is first in the DOM inside a container that
   inherits the page direction, as in `MatchScoreHeader`: in Arabic home is on
   the right with its score beside it, so an away win 0-1 reads "1 - 0" with the
   away crest on the left (pinned by `ArticleClubPlate.rtl.test.tsx`, measured
   in the browser).
   **Arabic club names.** The news team filter has Latin names only, so chips
   and tags take the translated names from the football club directory
   (`useNewsClubs`), keeping the news row's crest and colours.

5. **Alive, not pale (owner direction 2026-10-28, added after the first
   draft).** The page was white cards on near-white with colour in thin lines.
   Applied with the existing system only:
   - the club-colour halves are full-strength fills (`clubMatchPalettes`, so
     contrast and the home/away clash rule hold), with the score or kick-off
     time as the loudest figure on the card (kit score steps, Changa);
   - the tag is a bold chip in the club's colour on every row, not a grey word;
   - the lead / newest-stories carousel sits on a deep-navy stage (edge to
     edge on a phone, a rounded sheet in the column on desktop), so the page
     opens on one dark, confident band; its arrows and dots use the on-ink
     tokens. No new colour, no gradient added; dark mode keeps the same band.

## Acceptance criteria

- French and Arabic (RTL), 320 / 390 / 1440 px, light and dark: no element
  crosses the viewport edge (measured with element boxes), club-colour plates
  keep their crest discs and score/time legible, the order mirrors in Arabic
  (home half at the inline start).
- No two adjacent cards share a thumbnail unless they are about the same match.
- The photo-less articles never show a stock photo when they name a club.
- No card, chip or article eyebrow shows "Dernières actualités" / "آخر الأخبار".
- The club row lists only clubs in the current season's table, in one line.
- A real hero image is untouched; licensed items keep their source credit.
- Every new string exists in French and Arabic; `tsc`, eslint, prettier and the
  news / i18n tests pass.
