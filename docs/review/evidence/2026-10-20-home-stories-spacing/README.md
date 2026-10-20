# Home stories spacing

The spacing override targeted `main`, but `AppShell` now places the 16/24 px
screen padding on an inner `UiScreen` div. Updated the home-only selector to
target that div. Story sizing and the rail's own spacing remain unchanged.

Measured on this checkout's isolated Vite server (`127.0.0.1:4187`) with local
mock data and intercepted story RPC/image fixtures. No shared database writes.

| Layout without deadline banner | Before | After |
| ------------------------------ | -----: | ----: |
| French / Arabic, 390 px        |  36 px | 20 px |
| French / Arabic, 1440 px       |  44 px | 20 px |

Measurements run from the content-container top to the first story circle.
`before.json` and `after.json` record 16 combinations: both languages, both
widths, deadline banner present/absent and feed populated/empty. All 16
comparisons passed: only populated layouts without the banner changed; the
remaining measurements stayed identical. The lower rail gap remains 20 px,
and story buttons remain within the viewport. No page errors were recorded.

Screenshots: `before-{fr,ar}-{390,1440}.png` and
`after-{fr,ar}-{390,1440}.png` show the affected layouts.

Validation:

- Existing `balanced-rail.mjs`: 12 language/viewport/theme layouts plus eight
  deadline/empty-feed cases passed, including captions, viewer headlines and
  Escape. Updated its measurement target to the real inner content container.
- Existing home structure and match-carousel tests: 35 passed.
- TypeScript, scoped ESLint, Prettier and `git diff --check` passed.

Browser command:

```sh
STORY_RAIL_URL=http://127.0.0.1:4187/ \
  STORY_RAIL_OUT=/tmp/home-stories-balanced-check \
  node scripts/qa/home-stories/balanced-rail.mjs
```

The server used mock Auth/Fantasy/Football/Pépites and the story fixture setup
documented in `docs/product/balanced-story-rail-evidence/README.md`. Changes
await draft PR review; nothing was merged or deployed.
