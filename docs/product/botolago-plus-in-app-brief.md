# BotolaGO+ inside the app: « Votre saison », « Détail du duel » and the Curva preview

Screen-work brief (AGENTS.md, "Screen work"). Written before any interface change, on branch
`claude/plus-in-app-teasers` (based on `claude/plus-step2-analytics`, PR #470, with `main` merged in
for the premium card reads). Copy it into the draft pull request description.

Step 2 of the offer (PR #470) shows the approved analytics screens on an example season. This lane
puts the same screens inside the normal app: blurred behind a lock for people who are not members,
clear and real for members. The owner decisions of 2026-10-14 are the scope.

## What must be preserved

- The offer itself (`/curva/plus`, `/plus`), its four steps, step 2's look and tabs, and the
  example dataset. The offer renders exactly as in #470; the screens are made data-driven by a
  context whose default is the example, not forked.
- Curva's card page, face-à-face sheet and home as they are today: the card, the rating line,
  « D'où vient votre note », « Votre palier », « Revoir », « Les vôtres », the share button and
  every existing test. The lock chips in `PlusEntryRows` / `PlusDuelEntry` stay.
- Business logic: Fantasy rules, scoring, gameweek lifecycle, Manager Card rules. Display only.
  No database write, no migration, no Lovable action. Reads are the existing ones.
- Brand identity and the `--po-*` / ui-kit tokens. The logo is the only way the product name
  appears (`PlusLogo`); no typed name, no typed arrows in JSX.
- French « vous » register and Arabic with the same meaning, right to left; Western digits.
- No « just for fun », no prizes, no subtitle under a title, little text, one headline per block.

## What changes

1. **`PlusLockedSection`**: a reusable wrapper. A clear head (the reader's real figures, passed in),
   then the analysis rendered from the **example** dataset, blurred (CSS blur 12px plus a dark
   gradient veil), inert and `aria-hidden`, with a lock, one headline that carries the context
   (« Votre saison en détail », « Votre duel en détail ») and a mint « Débloquer » button that opens
   the existing paywall (`/curva/plus?step=3`). After a purchase the offer closes back to the page
   the reader came from, and the section is open and clear.
2. **Card page (`CurvaCardPage`)**: a « Votre saison » section with the four tabs (Résumé, Points,
   Décisions, Note). Non-member: real total points and league position on top (from the league
   standings the free screens already load), example analysis blurred below. Member: the same
   screens, fed by `get_my_card_career` through a mapper.
3. **Face-à-face sheet (`HeadToHeadSheet`)**: a « Détail du duel » section with its four tabs
   (Course, Comparaison, Décisions, Notes). Non-member: both managers' real points and positions on
   top, blurred example below. Member: `get_card_duel` through a mapper.
4. **Curva home (`CurvaHome`)**: one small blurred preview (the points race mini chart) that opens
   the full section on the card page. Non-member only; a member has the section on the card page.
5. **Members**: the BotolaGO+ logo, small, in the app header and in Profil.
6. **Mapper**: `plus-member-data.ts` turns the paid reads into the screens' data shape. Figures the
   backend does not serve yet (league average and best per journée, ranks, league captain and
   transfer averages, the rival's decision figures) become a missing value shown as « — ». The
   mapper lists them in one place so lane L can fill them in.

## Security rule: never blur real paid data

Blur is presentation, not protection: devtools can read anything that is in the DOM. Therefore:

- A non-member's render is built from the example dataset only. The paid reads
  (`get_my_card_career`, `get_card_duel`) are **not called** for a non-member (the hooks are
  disabled), and nothing derived from a paid response is passed to the blurred part.
- The only real figures a non-member sees are the ones the free screens already load: the league
  standings (total points, position) and the card. They sit in the clear head, outside the blur.
- The reads answer `{ locked: true }` for a non-member anyway; that is the second layer, not the
  first. A test renders the non-member screens with a spy on the paid reads and asserts that none
  was called and that no value from a member fixture appears in the markup.

## Feature-off guarantee

With `PREMIUM_BUILD = false` (and no dev preview), or premium mode off, or the member status not
enabled, **nothing new renders anywhere**: no section, no preview, no header mark, no extra request,
no extra DOM node. The app is exactly as today. Each integration is gated by the module-level
`PREMIUM_SURFACES` constant and by `usePremium().enabled`; the paid reads are enabled only for a
member. Tested explicitly on each of the three places.

## Acceptance criteria

Visual and functional:

- Non-member, card page: real points and position clear on top; below, the lock, the headline and
  « Débloquer »; the analysis behind is blurred and cannot be focused, clicked or read by a screen
  reader (`inert`, `aria-hidden`). « Débloquer » opens `/curva/plus?step=3`.
- Member, card page: the section is clear, the four tabs work, real points from the career read,
  « — » where the backend has no figure; no lock anywhere.
- Face-à-face: same two states with the four duel tabs; a history the opponent hides shows a short
  line, not a broken chart.
- Home: one small blurred chart, a lock, one tap to the card page's section.
- Feature off: identical DOM to today on all three places and no new request (tested).
- French and Arabic (right to left) at 390 and 1280 px, no horizontal overflow measured per
  element, smallest text at least 12px, the lock headline and the button at least 4.5:1 contrast
  measured from rasterised pixels (the blurred decorative content is excluded).
- Reduced motion keeps every figure at rest; the lock adds no animation beyond a short fade.

Checks run before review: the full `bun test`, typecheck, eslint on changed files, `bun run build`,
dictionary parity and banned words, the ui-kit contract tests, and before/after screenshots.
