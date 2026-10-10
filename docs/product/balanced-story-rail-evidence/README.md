# Balanced home story rail evidence

Before: published release `8479d203`, actual news images. After: full home-page local preview, deterministic images and four short labels; the surrounding header, deadline strip and gameweek band are real application components. French and Arabic at 320/390/1440px; light and dark themes checked.

The circle-and-caption group has a measured 20px gap above and below. Previously UiScreen added 16/24px above the rail and the gameweek band consumed 16px below on phones. Presence-scoped home styles remove those offsets only when needed. The deadline strip retains its original screen-padding cancellation, and an empty story feed retains the previous home layout.

Run `scripts/qa/home-stories/balanced-rail.mjs` against the full Vite dev server on 4176 with `VITE_NEWS_DATA_MODE=supabase`, `VITE_SUPABASE_URL=http://127.0.0.1:4319`, and the fixture publishable key `stories-local-fixture`. The browser intercepts backend requests; no database writes or image-generation calls. Checks cover geometry, short label fit, full viewer headlines and deadline/empty-feed combinations.

Type checking, scoped lint and all 14 theme tests pass. React review: no extra fetching, effects, mirrored state or altered hooks; existing accessible buttons and viewer behavior remain intact.
