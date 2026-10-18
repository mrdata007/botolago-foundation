# Desktop layout verification

Local fixture data only; no database writes. The fixture build enables sample
News and Curva destinations, so the header is also exercised with five links.

## Observed regression

Before the change, the 1024px home gameweek band measured **264px** in both
French and Arabic. The new browser regression failed for those two cases;
the other eight language/viewport combinations passed. Baseline screenshots
were collected after installing missing locked dependencies and restarting
the development server to clear its stale error overlay.

After the change, all 14 desktop-layout browser tests pass:

- Home, Matches and Profile headers fit without overlapping controls at 390,
  768, 1024, 1280 and 1440px in French and Arabic.
- At 1024, 1280 and 1440px the gameweek band measures at least 400px wide.
- Match-card bounding boxes stay contained; the check does not rely only on
  document scroll width, which can hide clipped content.
- The phone bottom navigation remains visible and Arabic remains RTL.
- Compact search at 1024px and inline search at 1280px both open correctly.
- The 1440px home screen renders in dark mode in both languages.

## Screenshots

`home-{fr,ar}-{390,768,1024,1280,1440}-{before,after}.png` records the complete
light-mode matrix. Additional `home-{fr,ar}-1440-dark-after.png` and
`matches-{fr,ar}-1440-after.png` show the desktop dark theme and shared header.

| View           | Before                            | After                           |
| -------------- | --------------------------------- | ------------------------------- |
| French, 1024px | [Before](home-fr-1024-before.png) | [After](home-fr-1024-after.png) |
| Arabic, 1024px | [Before](home-ar-1024-before.png) | [After](home-ar-1024-after.png) |
| French, 1440px | [Before](home-fr-1440-before.png) | [After](home-fr-1440-after.png) |
| Arabic, 1440px | [Before](home-ar-1440-before.png) | [After](home-ar-1440-after.png) |
| French, 390px  | [Before](home-fr-390-before.png)  | [After](home-fr-390-after.png)  |
| Arabic, 390px  | [Before](home-ar-390-before.png)  | [After](home-ar-390-after.png)  |

## Other checks

- 441 existing shell, home and UI-kit tests passed.
- Both existing keyboard-search accessibility tests passed (French and Arabic).
- TypeScript checking passed.
- Production build, including the legal placeholder gate, passed.
- React review: changes are responsive classes only; no new dependencies,
  effects, subscriptions or data fetching. Existing accessible names, active
  navigation states, search semantics and logical RTL utilities are preserved.

The fixture server was started from this checkout on its own port, 4377.
Production data and publishing were not exercised.
