# Branded notification email options

The owner requested five versions for every notification email and an individual
choice per type. This branch delivers a local review gallery, not a production
renderer change. The [brief](2026-10-20-notification-email-design-brief.md) was
committed before the prototype code.

## Five directions

| Version | Direction  | Design                                                        |
| ------- | ---------- | ------------------------------------------------------------- |
| 1       | Club       | Navy masthead, cyan data panel, mint-to-cyan rounded action   |
| 2       | Journal    | White editorial masthead, fine rules, restrained data panel   |
| 3       | Stadium    | Existing branded stadium JPEG, white reading area             |
| 4       | Ticket     | Event strip, perforated dividers, compact rectangular action  |
| 5       | Scoreboard | Navy canvas, cyan figures, data before supporting explanation |

Official assets are copied unchanged from `public/email/` and `public/og-image.jpg`.
The mint stop is the sRGB raster value of `--ui-accent-spring`, measured in Chromium;
cyan/navy use the existing email palette. No logo is reconstructed from text.

## Coverage and selection

| Step | Notification       | Review state                                                    |
| ---- | ------------------ | --------------------------------------------------------------- |
| 1    | Today's matches    | Five versions, French/Arabic, ready to choose                   |
| 2    | Today's results    | Five versions, French/Arabic, ready to choose                   |
| 3    | Round preview      | Five versions, French/Arabic, daily fixture groups preserved    |
| 4    | Kick-off reminder  | Five versions, French/Arabic, ready to choose                   |
| 5    | Selection opens    | Five versions, French/Arabic, confirmed deadline preserved      |
| 6    | Selection deadline | Five versions, French/Arabic, confirmed deadline preserved      |
| 7    | Fantasy points     | Five versions, French/Arabic, score/rank/season total preserved |
| 8    | Prospects weekly   | Five versions, French/Arabic, all ten entries preserved         |

The gallery has language and viewport controls, full-email links, independent
choices for all eight types, local persistence, a copyable list and JSON export.
No choice is preselected. The chooser uses synthetic data, including mixed-script
player names; nothing is sent. Its iframe sandbox blocks in-preview navigation.

## Source and behavior

The generator uses the current production renderers and synthetic fixture helper.
It extracts their escaped HTML into ordered blocks and applies presentation only.
Subjects, preheaders, factual data, CTA labels/targets and footer links stay with
their source. Daily headings stay adjacent to their corresponding fixture groups.
The three automated Fantasy moments use their current trusted-input contracts and
the selected score-reveal source. Archived, unselected production directions are
not separate notification types.

No production renderer, dispatcher, API, database, migration, delivery setting,
preference or consent rule changes. The source imports are pure render calls.

## Verification

- 66 fresh baseline renders: 22 existing family/language combinations at
  320/390/1280px; no overflow or broken images. Inspected representative football,
  deadline and Arabic points screenshots before writing the brief.
- 240 final alternative renders: 80 HTML previews at 320/390/1280px. Visible
  element and text ranges fit the viewport; logos load, Arabic direction is
  correct, and primary actions meet the 44px floor. Full content fragments,
  ordered data groups, CTA destinations and footer links are checked against
  the existing renderer output.
- Gallery behavior: eight independent choices, persistence, all 40 Arabic
  preview paths, mobile/desktop bounds, JSON export and reset passed.
- 20 fallback checks: all five designs in French/Arabic with media CSS removed
  or images blocked. Text, branding and the primary action remain available.
- 106 existing renderer tests passed; typecheck and scoped ESLint passed.
- Inspected all five directions, French and Arabic examples, football, points,
  round grouping, Prospects and the comparison gallery. Representative captures
  are in [the evidence folder](evidence/2026-10-20-notification-email-options/).

Browser layouts are not Gmail/Outlook/Apple Mail certification. Real sending,
inbox rendering, forced client dark modes and assistive-technology testing remain
for the selected designs. This branch intentionally stops at the requested choice.

## Reproduce

With the locked dependencies installed:

```sh
bun scripts/design/notification-email-options.ts /tmp/botolago-email-design/options
python -m http.server 4391 --bind 127.0.0.1 --directory /tmp/botolago-email-design
```

Open `http://127.0.0.1:4391/options/index.html`.

```sh
node scripts/design/verify-notification-email-options.mjs /tmp/botolago-email-design/options
node scripts/design/verify-notification-email-gallery.mjs /tmp/botolago-email-design/options
```

`EMAIL_OPTIONS_URL` overrides the verification URL; `E2E_CHROMIUM_PATH` chooses
Chromium. The raw geometry and screenshots are written beside the gallery.
The task artifact includes an offline HTML gallery and all eighty email files.
