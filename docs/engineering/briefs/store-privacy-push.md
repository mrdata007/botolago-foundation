# Brief: push alerts in the privacy policy

Screen work on the text of one page, `/privacy` (AGENTS.md, "Screen work").
Written after reading the page and the push code, before the first change.
The page renders `PRIVACY` from `src/content/legal/documents.ts` through
`LegalRoutePage`; nothing about the page's layout or components changes.

`docs/mobile/PHONE_APP.md` ("Still open before a store submission") and
`docs/backend/PUSH_NOTIFICATIONS.md` both say push is not in the policy's
purposes and phone tokens have no row in its retention table. The store forms
(App Store Connect's App Privacy, Google Play's Data safety) are filled from
the policy, so the policy has to say it first.

## What must be preserved

- The layout: the same blocks, the same table component, the same headings
  and section numbers (1 to 13) in French and Arabic. Only rows are added to
  three existing tables (each table keeps its width), and the Apple / Google
  row of the subprocessor table gains a few words.
- Every other sentence of the owner's document, word for word. Version 1.3's
  wording (the deletion timeline, the analytics switch, the prize records)
  stays as approved.
- The legal tests: no bracketed blank, no note about drafting, the two
  languages with the same structure, the analytics switch still deciding the
  Seline wording.
- No wording about AI authorship (AGENTS.md, "Public editorial rule").

## Improvements

1. Section 2 (data collected): a row for push alerts: the phone's push
   identifier (Apple or Google token), the platform, the random install
   identifier the app creates, the app version, language and time zone;
   source: the phone, only when the reader turns the alerts on.
2. Section 3 (purposes): a row for sending push alerts (match alerts and
   Fantasy reminders), legal basis consent: on only when the reader turns them
   on and the phone allows it, off at any time in the app or the phone.
3. Section 5 (recipients): the Apple / Google row says what those services
   receive for an alert (the push identifier and the alert's text).
4. Section 7 (retention): a row for the push identifier that states what the
   code does today, not what was intended: turning alerts off stops the
   sending; the identifier is erased when the reader signs out on that phone,
   when another account registers on that phone, or at once when the account
   is deleted.
5. The version line goes to 1.4 with a new effective date, which is the
   owner's to confirm (section 12 promises 7 days' notice of a substantial
   change).

## Acceptance criteria

- `/privacy` in French and in Arabic shows the four additions in the right
  sections; the Arabic reads right to left like the rest of the page; tables
  keep their columns on a phone (390px) and on a desktop.
- `bun test src/content/legal`, `bun run typecheck`, `bun run lint` and
  Prettier pass. A new test holds the push rows in both languages.
- Every statement about retention matches the code: `api.disable_my_notification_device`
  (keeps the token), `api.unregister_my_notification_device` (deletes it),
  the takeover in `20261005140000`, the account deletion in `20261006143700`.
- The owner approves the wording before merge, as for version 1.3 (the file is
  the owner's document).
