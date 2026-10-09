# Manager Card collectible redesign: the AFTER set

The collectible (Éclat, renderer `eclat-v1`) on every surface that draws it, captured from the
redesign branch after the review fixes (§17 of
[`../../MANAGER_CARD_SORARE_STYLE_PLAN.md`](../../MANAGER_CARD_SORARE_STYLE_PLAN.md)), so it can be laid
beside the BEFORE set ([`../before/INDEX.md`](../before/INDEX.md)) **name for name**: every file here has the
file name of a file there (`g1-rated-fr-light-390.webp` is the same page, state, language, theme and
width in both). The criteria it serves are in
[`../../MANAGER_CARD_SORARE_STYLE_BRIEF.md`](../../MANAGER_CARD_SORARE_STYLE_BRIEF.md). Nothing here touched
a database: the server ran in the mock data modes.

## Where the pictures come from

| What                     | Value                                                                                                                                                                                                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tree captured            | `/home/user/mc-sorare`, branch `claude/manager-card-sorare-style` at `c493bb3c` **plus the review fixes** that the commit adding this folder holds (they were uncommitted when the pictures were taken; their source and test files are listed by `git show --stat` of that commit) |
| Renderer in the pictures | `eclat-v1`: the card's root class is `mc-eclat …` (191 pictures), its tokens are `mc-tok` (105 pictures), 11 pictures draw no card art (the text-only surfaces). Recorded per picture in `capture-log.json`, `drawn.root`                                                           |
| Server                   | `bun run dev` of that tree on **port 4193**, started for this run and stopped by its process id afterwards; no other server was measured. The same command as the BEFORE set (its page), with `--port 4193` and `VITE_MANAGER_CARD_PREVIEW=1`                                       |
| Scripts                  | The BEFORE set's, unchanged: `node docs/product/manager-card-sorare-style/before/capture-before.mjs --base=http://127.0.0.1:4193 --out=<dir> --jobs=3`, then `before/capture-gallery.mjs`, then `before/to-webp.py` (WebP quality 92, never resized)                                |
| Browser and viewports    | Chromium `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, Playwright from the repository; 390 × 844 at device scale 2 (780 × 1688 files) and 1440 × 900 at scale 1; the share picture is 1080 × 1920 (its own pixels)                                                          |
| Clock and motion         | clock fixed at 2026-10-08T20:00:00Z (a countdown reads the same as in the BEFORE set), `prefers-reduced-motion: reduce` (the card is at rest)                                                                                                                                       |
| Account and data         | the mock auth's demo account seeded into storage (« guest » pictures are signed out); the development fixtures of `src/backend/manager-card/fixtures.ts` chosen with `?mc=<fixture>`; the card prints « Exemple » / «مثال» (`sample`) as the preview does                           |

The eight surfaces the review asked to see are `g2` (votre carte), `g3` (les vôtres), `g4` (face à face,
French and Arabic), `g6` (seasons), `hero`, `share` (the sheet), `picture` (the exported image itself, French
and Arabic) and `hub-owner` / `rankings-token` / `league-band` (the in-line Fantasy surfaces), each at 390 @2×
in French and Arabic, light and dark where the table says so.

Names are `<screen>-<fixture>-<lang>-<theme>-<width>`, as in the BEFORE set (see its « Conventions the
pictures follow »: a hero and the stage are two pictures, the « MODE DÉMO » pill sits over the foot of some
pictures, viewport pictures rather than full pages, the share picture does not depend on the theme).
