# Club notification email implementation

The owner selected **Club (version 1) for all eight notification emails**. The
production renderers now use that selection, including legacy queue payloads and
the three trusted automated Fantasy moments. The implementation brief was
committed before renderer changes.

## Changes

| Area         | Previous                                                 | Club implementation                                                                           |
| ------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Branding     | Text wordmark in generic emails; separate manager header | Official light PNG wordmark on one consistent navy masthead                                   |
| Reading area | Different heading sizes, margins and footers             | Shared white card, clear title hierarchy, French punctuation protection and Arabic typography |
| Fantasy data | Navy score/deadline panels                               | Cyan panels with navy figures and matching rounded corners                                    |
| Actions      | Compact navy buttons with varying shapes                 | Full-width rounded mint/cyan actions; solid cyan fallback                                     |
| Architecture | Three duplicated HTML shells                             | Pure shared Club shell; shared palette/escaping with compatible existing exports              |

All eight types use Club: daily fixtures, daily results, round preview, kick-off
reminder, selection opens, selection deadline, Fantasy points and Prospects.
Existing subjects, preheaders, plain text, data, ordering and footer/CTA targets
are preserved. The official wordmark links to the validated application origin.
Fixture day groups and favorite-club emphasis remain intact. No eligibility,
scoring, deadline, consent, preference, unsubscribe or delivery behavior changed.

The implementation uses pure string rendering and escaped content fragments.
Browser DOM extraction remains confined to the design-review generator. Its
extractor now understands the shared footer, nested CTA and cyan panels, so the
five-direction gallery can still be regenerated.

## Verification

- 28 before/after cases: all 16 generic type/language pairs, six automated
  Fantasy pairs, and six zero/negative/large-score stress cases.
- 168 rendered captures across before/after at 320, 390 and 1280px. All 84
  after cases preserve subjects, preheaders, plain text, ordered body content,
  footers and existing action/footer links. Text/element bounds, RTL, official
  image loading and a 44px minimum action height pass.
- 44 fallback cases: all 22 production family/language pairs with media CSS
  removed or images blocked. Content, action, branding alt text and bounds pass.
- Two baseline-only overflow cases use synthetic six-digit gameweek scores at
  320px. The new layout also fits those stress cases.
- 144 existing tests pass across six renderer, trusted-adapter, dispatcher and
  Prospects contract suites. The generic resource-safety assertion now permits
  exactly the official same-origin image; script and arbitrary resource guards
  remain. Application and focused renderer/preview typechecks, scoped ESLint,
  formatting and committed-secret checks pass.
- The review gallery regenerates all 80 French/Arabic previews from current
  renderers; its existing geometry/content verifier checks the five directions.

Representative before/after screenshots and machine summaries are in
[evidence](evidence/2026-10-20-notification-email-club/). Visual inspection covers
football round grouping, results, Prospects, Fantasy deadlines and points, both
languages, mobile/desktop and fallback rendering.

Gmail, Outlook and Apple Mail inboxes, client-forced dark mode and native screen
readers were not available for inspection. No real email was sent. No database
or delivery settings changed. This is a draft implementation; merge and deployment
are separate release steps requiring the owner's approval under AGENTS.md.

## Reproduce

```sh
bun scripts/design/notification-email-club-previews.ts /tmp/botolago-email-design/club-after
python -m http.server 4391 --bind 127.0.0.1 --directory /tmp/botolago-email-design
node scripts/design/verify-notification-email-club.mjs /tmp/botolago-email-design
```

The verifier also requires `club-before/rendered.json` and its HTML/assets,
created by running the same preview script against the renderer before the
Club change. `EMAIL_CLUB_URL` overrides the local server; `E2E_CHROMIUM_PATH`
selects Chromium. The downloadable task artifact contains the final HTML
previews, official asset and summary; committed evidence includes selected
before/after screenshots.
