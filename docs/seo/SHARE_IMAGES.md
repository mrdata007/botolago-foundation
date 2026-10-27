# Share images (og:image / twitter:image)

## What ships today

| Page                | og:image / twitter:image                                    | twitter:card          |
| ------------------- | ----------------------------------------------------------- | --------------------- |
| Every page (root)   | `/og-image.jpg`, 1200x630, alt "BotolaGO"                   | `summary_large_image` |
| Article with a hero | the hero (`article-meta.ts`), with its size and alt         | `summary_large_image` |
| Club page           | the club's crest, when it is an https raster (png/jpg/webp) | `summary`             |
| Match page          | the home side's crest, same rule                            | `summary`             |

The crest rule is `src/lib/share-image.ts` (`crestShareMeta`). A crest that is
missing, a vector (`.svg`), a GIF or plain http gives no tags, and the root's
generic picture stands. WhatsApp, Facebook and X do not draw SVG.

`alt` is "Ecusson <club>" on a club page and "<home> - <away>" on a match page.

## Known gap: declared size

The router merges heads tag by tag, and a page can replace a parent's tag but
not drop it. The root declares `og:image:width` 1200 and `og:image:height` 630
for its default picture, so on a club or match page those two tags still say
1200x630 over a square crest. Crawlers read the real image, so the preview is
right, but the declared size is wrong. A crest's real size is not recorded
(`MEDIA_WIDTHS` says the smallest stored original is 150px), and a guessed size
would be wrong too.

Fix, outside this package (`src/routes/__root.tsx`): drop the root's
`og:image:width` / `og:image:height` and declare them on the pages whose size is
known (the generic fallback is 1200x630; add them where the root's picture is
used), or record the crest's size when the catalog job stores it.

## Proposal: a score card per match (not built)

A 1200x630 PNG per match (crests, score or kick-off time, competition) is the
share picture people expect on WhatsApp. It was not built here because it needs
an image renderer in the Cloudflare worker, and the repository has none:

- `satori` + `@resvg/resvg-wasm` (SVG to PNG): about 1.5 MB of wasm and a font
  file bundled into the worker, which is close to the free-plan worker size
  limit and adds cold-start time.
- Cloudflare Browser Rendering or Images binding: a paid binding and a new
  deployment dependency.
- Generating the PNG in the database/Edge Function side and storing it in
  `football-media`: no renderer there either.

Recommended shape if the owner wants it:

1. A route `/og/matches/$matchId.png` rendered with `satori` and `resvg-wasm`,
   with `Cache-Control: public, max-age=300, s-maxage=3600` for a scheduled
   match and `max-age=31536000, immutable` for a finished one (key the URL by
   `?v=<status>-<score>` so a score change busts the cache).
2. Fonts: one Latin and one Arabic subset, loaded as static assets, not fetched.
3. `og:image` on the match page points at it, with width 1200, height 630 and
   the alt above; the crest stays as the fallback when rendering fails.
4. Measure the worker bundle size and cold start on staging before shipping.

This needs the owner's decision (new dependency, deployment) before work starts.
