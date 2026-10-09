# Home stories — visual and interaction evidence

9 October 2026. Local development preview from this branch on port 4173,
using the repository's demo data; no production data was changed.

The approved scope and acceptance criteria were committed before the interface
change in [the brief](../home-stories-style-brief.md).

## Visual comparison

| View           | Before                       | After                                                                   |
| -------------- | ---------------------------- | ----------------------------------------------------------------------- |
| French, 390px  | [Before](before-fr-390.png)  | [Light](verified-fr-390-light.png) / [Dark](verified-fr-390-dark.png)   |
| Arabic, 390px  | [Before](before-ar-390.png)  | [Light](verified-ar-390-light.png) / [Dark](verified-ar-390-dark.png)   |
| French, 1440px | [Before](before-fr-1440.png) | [Light](verified-fr-1440-light.png) / [Dark](verified-fr-1440-dark.png) |
| Arabic, 1440px | [Before](before-ar-1440.png) | [Light](verified-ar-1440-light.png) / [Dark](verified-ar-1440-dark.png) |

After images show keyboard focus on the first highlight. Inspected the circular
crops, ring/surface separation, bold labels, spacing, and Arabic reading order.
The existing matchday band and responsive columns remain below the new row.

## Measured checks

Chromium, reduced motion, French/Arabic × 360/390/1440px × light/dark:
**12/12 passed**. [Raw geometry](verification.json).

- Row bounds stay inside the viewport; circles have equal width and height.
- Six translated links, each at least 44px in both dimensions.
- All images load with nonzero natural width.
- RTL starts on the right and reverses the items' visual positions.
- Tab reaches every link and scrolls it fully inside the viewport, in both
  directions. Focus explicitly calls `scrollIntoView` with nearest alignment.
- Each of the six links opens its expected route and Back returns to Home,
  checked in French and Arabic at 390px.
- No uncaught browser errors in the twelve scenarios.

Code checks: TypeScript passed; ESLint passed on the changed source and browser
helper; formatting and `git diff --check` passed. The existing Home, UI-kit and
i18n suites passed **410 tests, 0 failures**.

The existing `anonymous.acceptance.e2e.ts` suite passed **16/16 tests**:
six public routes at seven widths in both languages, plus the two first-launch
splash checks. It also checks browser console/network errors and match-card
bounds. Command: `E2E_BASE_URL=http://127.0.0.1:4173
E2E_CHROMIUM_PATH=/usr/bin/chromium playwright test
tests/e2e/anonymous.acceptance.e2e.ts`.

The anonymous browser suite's match-card helper now excludes the standings
route. Its old prefix selector counted the new scrollable Classement shortcut
as a match card and falsely reported its intentional off-screen position.
Actual match detail links retain the existing bounds checks.

These initial captures cover the section shortcut fallback. The expanded
admin-managed stories implementation is verified below. Game rules are unchanged.

## Admin uploads and published viewer

The owner expanded the scope to real admin uploads. The final component harness
uses actual story SQL and the existing upload handler with local file storage.
It is outside the application route tree; the plain “Stories” page heading is
fixture scaffolding, not the production admin shell.

- [Empty admin form](admin/admin-empty.png)
- [French mobile admin](admin/admin-fr-390-light.png) / [dark](admin/admin-fr-390-dark.png)
- [Arabic mobile admin](admin/admin-ar-390-light.png) / [dark](admin/admin-ar-390-dark.png)
- [French desktop admin](admin/admin-fr-1440-light.png) / [dark](admin/admin-fr-1440-dark.png)
- [Arabic desktop admin](admin/admin-ar-1440-light.png) / [dark](admin/admin-ar-1440-dark.png)
- [French mobile viewer](admin/viewer-fr-390-light.png) / [dark](admin/viewer-fr-390-dark.png)
- [Arabic mobile viewer](admin/viewer-ar-390-light.png) / [dark](admin/viewer-ar-390-dark.png)
- [French desktop viewer](admin/viewer-fr-1440-light.png) / [dark](admin/viewer-fr-1440-dark.png)
- [Arabic desktop viewer](admin/viewer-ar-1440-light.png) / [dark](admin/viewer-ar-1440-dark.png)

Checks: two HTTP 201 uploads, draft persistence after reload, publication-only
visibility, next/previous navigation and destination link, Escape/focus return,
all element bounds inside the viewport in eight locale/size/theme states, and
unpublishing both stories leaving the public RPC empty. No browser errors.

Final code verification: TypeScript and changed-source ESLint passed; **494
unit tests passed** (22 files), including existing upload byte validation and
admin permission tests. The final anonymous public-route regression passed
**4/4** FR/AR mobile/desktop scenarios. Production bundle built successfully
against the repository's local stub backend.

The isolated SQL assertions verify authorization, publication, optimistic
locking, validation and audit writes with the real staff authorization functions.
Auth/media schemas and media registration use local fixtures; live Supabase
storage and a deployed staff session remain rollout checks. No production or
shared database writes were performed. Before fixture resets, only this task's
connection was active; the private container has no network or cron jobs.

[Browser log](admin/browser.txt), [SQL result](admin/database.txt),
[reproduce](../../../scripts/qa/home-stories/README.md),
[rollout](../../backend/HOME_STORIES.md).
