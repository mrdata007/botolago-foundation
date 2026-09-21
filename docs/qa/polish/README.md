# Polish pass — measured before/after

Evidence for BG-0113 and for the integration fixes that precede it. Every entry
states what was measured, with what, and at which viewport, so a reader can
re-run it rather than take the screenshot's word for it.

Measurements are taken against a dev server this session started on its own
port — **never 4173**. That port is shared with other worktrees in this
sandbox, and a Playwright run that reuses an existing server there measures a
different tree entirely. That has already produced one false failure in this
project (`docs/engineering/LAUNCH_LEDGER.yaml`, BG-0091 notes).

The language chooser is a full-screen dialog on first load and will be the
`[role="dialog"]` any naive selector finds. Set `botolago.language` in
`localStorage` via an init script before navigating, or you will measure the
chooser and believe it is the sheet.

---

## `UiSheet` width — the sheet did not follow the column

**When** 2026-09-21, integrating lane BG-0118 (shell/hub) into
`chief/launch-fixes-3`.

**What changed upstream.** BG-0118 moved `FantasyFrame` off the 480px
`--ui-column-max` phone canvas onto `max-w-2xl` (672px), the same rule
`UiScreen width="content"` uses and the one Home, Matches, Standings and
Profile have used since the shell migration. That fixed the owner's desktop
complaint. `UiSheet` stayed pinned to `--ui-column-max`, deliberately, on the
reasoning that a bottom sheet should stay thumb-width.

**Why that reasoning inverts.** The 480px cap has no effect below 672px — the
sheet is already full-bleed on every phone. The only place it showed was
desktop, where thumb reach is not a constraint and a 480px sheet centred under
a 672px screen reads as a mistake. It is also where the picker's price and form
columns have room to come back.

**Measured**, `/fantasy/transfers` → "Ajouter un joueur", bounding boxes read
from the live DOM rather than from the screenshot:

| viewport | frame | sheet before | sheet after |
| -------- | ----- | ------------ | ----------- |
| 390px    | 390px | 390px @x=0   | 390px @x=0 — unchanged |
| 1440px   | 672px | 480px @x=480 | 672px @x=384 — matches the frame |

At 1440 the sheet now sits at x=384 with 384px of gutter on both sides, so it
is centred on the same axis as the column rather than inset within it. Phones
are untouched, which is the point: this was only ever a desktop defect.

![before](sheet-width-1440-before.png)
![after](sheet-width-1440-after.png)

`ui-kit.contract.test.ts` 98 pass / 0 fail.
