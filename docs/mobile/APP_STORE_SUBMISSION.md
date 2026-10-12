# App Store and Google Play submission paperwork

Written 2026-10-12 from the code on `main` (`471da9b0`) and the policy change on
the branch `claude/store-privacy-push`. Nothing here was checked on a phone or
against the production database: every answer comes from reading the code, and
the places where the code alone cannot settle it are marked **Check**.

What the app is, for this paperwork: the iPhone and Android app is a thin shell
(Capacitor) that opens `https://botolago.com`. So **the app collects what the
website collects**, plus what the shell adds: the phone's push address when the
reader turns alerts on, a random install id, and saving or sharing a picture
(`docs/mobile/PHONE_APP.md`). There is no advertising SDK, no in-app purchase
and no tracking.

**One finding outside the code.** The live site carries two scripts that are
not in this repository: Lovable, which hosts botolago.com, adds them when it
serves the page (seen in the HTML of `https://botolago.com/` on 2026-10-12):

- `/~flock.js`, Lovable's visitor analytics: a `page_hit` with the address,
  referrer, browser (user agent), language and a country guessed from the time
  zone, plus page-speed measures, under a 30-minute session id kept in a
  `session-id` cookie (or browser storage), sent through `/~api/analytics`.
- `/__l5e/events.<hash>.js`, Lovable's monitoring: session start, page views,
  JavaScript errors (the site's own error screen also hands errors to it,
  `src/lib/lovable-error-reporting.ts`, called from `src/routes/__root.tsx:151`),
  performance timings and web vitals, sent to `/__l5e/trackevents`. The same
  script can record sessions (rrweb) and capture clicks, but on the live page
  neither is switched on (no `data-replay` or `data-autocapture` attribute). It
  has an `identify` call; nothing in this code base calls it, so its events
  carry no account id.

These run inside the app too, since the app is the site. They change three
answers below (Product Interaction, Crash Data, Performance Data) and the
privacy policy does not mention them (blockers, item 1b). **Check** in the
Lovable project settings whether either can be switched off; if both are
switched off, those three answers go back to what the code alone gives.

Contents:

1. App Privacy answers (App Store Connect)
2. Data safety answers (Google Play Console)
3. Notes for the App Review team, with the facts behind them, guideline 4.2 and age ratings
4. Remaining blockers, with who does what

---

## 1. App Privacy answers (App Store Connect)

App Store Connect, the app, **App Privacy**, **Get Started**.

**"Do you or your third-party partners collect data from this app?"** Yes.

**Tracking: none.** No data is linked with other companies' data for
advertising, and nothing is shared with a data broker. There is no advertising
SDK, no advertising identifier (IDFA), and the app never asks for App Tracking
Transparency (none is needed). Evidence: no ads, attribution or analytics SDK in
`package.json` (the native plugins are the seven `@capacitor/*` packages at
lines 50-57 and `@capacitor-community/media`); the code's only measurement is
Seline, which sets no cookie and keeps no identifier (`src/lib/analytics.ts:1-27`),
and Lovable's hosting scripts (above) measure the site for its owner, not for
advertising, with a session id that lasts 30 minutes. The
privacy manifest declares no tracking (`docs/mobile/PHONE_APP.md`, privacy
manifest item). So for every row below, "Used for tracking" is **No**.

| Apple data type                                                                                                                 | Collected                             | Linked to the user | Tracking | Purposes                     | Evidence and notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------ | -------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contact Info, **Email Address**                                                                                                 | Yes                                   | Yes                | No       | App Functionality            | Account sign-up and sign-in (Supabase Auth), the account e-mails, and the match and Fantasy notification e-mails sent through Resend (`src/content/legal/documents.ts`, policy section 5, Resend row). No marketing e-mail system exists (`src/content/legal/legal-content.test.ts`, item 8), so not "Developer's Advertising or Marketing".                                                                                                                                                                                                                                                                   |
| Contact Info, **Name**                                                                                                          | Yes                                   | Yes                | No       | App Functionality            | The profile's "Nom affiché" (`src/routes/auth.profile-setup.tsx:343-350`; `app.profiles.display_name`, `supabase/migrations/20260720075453_identity_domain.sql:75`). People may type any name, but it can be a real one, so declare it.                                                                                                                                                                                                                                                                                                                                                                        |
| Contact Info, Phone Number, Physical Address, Other Contact Info                                                                | **No**                                |                    |          |                              | Not asked for anywhere in the app. Prize winners are asked for an ID and an address **outside the app**, by the BotolaGO team after contacting them (`src/content/legal/prize-terms.ts`, section on verification; `verification_notes` is a staff field, `supabase/migrations/20260924120000_fantasy_prizes.sql:207`). Apple's form covers data collected through the app. **Check** with the owner that no in-app form for winners is planned; if one is added, these become Yes.                                                                                                                             |
| User Content, **Photos or Videos**                                                                                              | Yes                                   | Yes                | No       | App Functionality            | The optional profile photo (`app.profiles.avatar_path`, stored under `avatars/<user id>/`). Saving a share picture to Photos is "add only": the app writes a picture and never reads the library, which is not collection.                                                                                                                                                                                                                                                                                                                                                                                     |
| User Content, **Gameplay Content**                                                                                              | Yes                                   | Yes                | No       | App Functionality            | Fantasy team, lineups, transfers, chips, points, rankings, league membership; Pronostics predictions and votes; the Manager Card (policy section 2, "Données de jeu").                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| User Content, **Other User Content**                                                                                            | Yes                                   | Yes                | No       | App Functionality            | Names people choose and others see: username, Fantasy team name, league names. Also the favourite club, followed clubs and saved articles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| User Content, **Customer Support**                                                                                              | No                                    |                    |          |                              | Support and the "Signaler" reports are e-mails the reader sends from their own mail app (`src/components/report/ReportNameMenu.tsx:94`, a `mailto:` link). Nothing is collected through the app. Declare Yes only if you prefer to count e-mail support.                                                                                                                                                                                                                                                                                                                                                       |
| Identifiers, **User ID**                                                                                                        | Yes                                   | Yes                | No       | App Functionality            | The account id (Supabase user id) and the public username.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Identifiers, **Device ID**                                                                                                      | Yes                                   | Yes                | No       | App Functionality            | Only when the reader turns push alerts on: the push token from Apple or Google and a random install id the app makes (`bg-<uuid>`, never the phone's hardware id; `src/services/native-push-runtime.ts:23-30`), stored with the platform, app version, language and time zone (`app.device_registrations`, `supabase/migrations/20260720121725_notification_catalog.sql:285-313`; the token in `app_private.push_destinations`, `supabase/migrations/20260720121727_notification_delivery_runtime.sql:103-120`). Apple does not name push tokens in its list; declaring them as Device ID is the safe reading. |
| Usage Data, **Product Interaction**                                                                                             | Yes                                   | **No**             | No       | Analytics                    | Seline counts page views and about sixty named events (the list is `AnalyticsEvent` in `src/lib/analytics.ts`), "sent by name only: no properties, no identifiers", addresses cleaned of ids and tokens, no cookie, IP hashed with a salt that changes daily (`src/lib/analytics.ts:1-27`; policy section 5). Lovable's hosting scripts also count page views and sessions (above). Neither carries an account id, so Not Linked. Linked: Yes would also be accepted; the code does not require it.                                                                                                            |
| Usage Data, Advertising Data, Other Usage Data                                                                                  | No                                    |                    |          |                              | No advertising in the app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Diagnostics, **Crash Data** and **Performance Data**                                                                            | **Yes** (while Lovable's scripts run) | No                 | No       | App Functionality, Analytics | No crash reporter in the code itself (no Sentry, Crashlytics, Bugsnag or similar). But Lovable's monitoring script on the live site sends JavaScript errors, performance timings and web vitals (above), and the site's error screen forwards errors to it. No account id, so Not Linked. If Lovable's monitoring is switched off, answer No. The policy's data table already lists "plantages" (crashes) under "Usage et analyse".                                                                                                                                                                            |
| Diagnostics, Other Diagnostic Data                                                                                              | No                                    |                    |          |                              | The servers keep ordinary request logs with IP addresses for security, 12 months (policy section 7); not one of Apple's diagnostic types.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Location (Precise or Coarse)                                                                                                    | No                                    |                    |          |                              | No location permission or API. The phone's time zone is stored with a push registration (to time alerts), which Apple does not count as location.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Purchases, Financial Info                                                                                                       | No                                    |                    |          |                              | No in-app purchase, no payment, no bank data (policy section 2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Health and Fitness, Sensitive Info, Contacts, Browsing History, Search History, Emails or Text Messages, Audio Data, Other Data | No                                    |                    |          |                              | None collected. Search inside the app is not stored (no search-log table among the migrations). Invitations are links the reader shares; the address book is never read.                                                                                                                                                                                                                                                                                                                                                                                                                                       |

**Privacy policy URL:** `https://botolago.com/privacy`. **User privacy choices
URL** (optional field): `https://botolago.com/suppression-compte`.

Before filing these answers, the policy must say the same thing. Version 1.4 on
`claude/store-privacy-push` adds push alerts (section 2 below explains); file the
App Privacy answers only after it is published.

### What the policy change adds (version 1.4, for the owner's approval)

`src/content/legal/documents.ts`, French and Arabic, layout unchanged:

- **Section 2, data collected**, a new row: "Notifications push": the phone's
  push identifier (Apple or Google token), the platform, the random install
  identifier the app creates, the app version, language and time zone; source:
  the phone, only when the reader turns alerts on.
- **Section 3, purposes**, a new row: sending push alerts (kick-off, goals and
  results of the reader's clubs, Fantasy reminders), legal basis **consent**: on
  only at the reader's request and with the phone's permission, off at any time
  in the app or the phone's settings.
- **Section 5, recipients**: the Apple / Google row now says that their push
  services receive the phone's push identifier and the text of each alert.
- **Section 7, retention**, a new row for the push identifier: kept while the
  phone is registered on the account; turning alerts off stops the sending; the
  identifier is erased when the reader signs out of the app on that phone, when
  another account turns alerts on on the same phone, or at once when account
  deletion is requested.
- The version line: **1.4, in force on 19 October 2026** (7 days from today,
  the notice the policy's section 12 promises). The owner sets the real date.

Why the retention row is worded that way, from the code:

| What happens                             | What the code does to the push token                                                                                                                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reader turns the Push switch off         | The registration is switched off (`enabled = false`), **the token stays stored** (`src/services/native-push.ts:190`, `api.disable_my_notification_device`, `supabase/migrations/20260926003100_ordinary_account_mfa_step_up.sql:1394-1415`) |
| Apple or Google says the token is dead   | Same: switched off, token kept (`api.service_invalidate_notification_device`, `supabase/migrations/20260720121729_notification_api_security.sql:1082-1109`)                                                                                 |
| Reader signs out on that phone           | Registration and token deleted (`src/services/native-push.ts:211`, `api.unregister_my_notification_device`, `..._mfa_step_up.sql:1418-1437`). Best effort: if the phone is offline it does not happen                                       |
| Another account registers the same phone | The old registration loses the token (`supabase/migrations/20261005140000_notification_device_takeover.sql`)                                                                                                                                |
| Account deletion requested               | Every registration of the account and its tokens deleted at once (`app_private.account_deletion_disable`, `supabase/migrations/20261006143700_account_deletion_automatic.sql:214-248`)                                                      |

There is **no time limit** on a switched-off token today, although the table's
own comment says "delete within seven days after invalidation"
(`..._notification_delivery_runtime.sql:120`); nothing does that yet. The policy
states what happens, so it is accurate. A small backend change (a daily purge of
tokens switched off for 7 days) would make the retention shorter and the comment
true; see blockers, item 9.

---

## 2. Data safety answers (Google Play Console)

Play Console, the app, **Policy and programs, App content, Data safety**.

**Overview questions**

| Question                                                              | Answer                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Does your app collect or share any of the required user data types?   | Yes                                                                                                                                                                                                                                                                                                                                                                      |
| Is all of the user data collected by your app encrypted in transit?   | Yes. The app only loads `https://botolago.com` (`capacitor.config.ts`, `cleartext` is off for the production address); Supabase, Seline, Resend, FCM and APNs are all HTTPS. Policy section 9: TLS in transit, encrypted at rest.                                                                                                                                        |
| Do you provide a way for users to request that their data is deleted? | Yes. In the app: Profil, Supprimer le compte (`src/routes/profile.tsx:730`, `api.request_account_deletion`). On the web, for people without the app: `https://botolago.com/suppression-compte` (`src/routes/suppression-compte.tsx`). Give that address as the **Delete account URL**.                                                                                   |
| Has your app undergone an independent security review?                | No                                                                                                                                                                                                                                                                                                                                                                       |
| Is your app's data shared with third parties?                         | **No sharing** in Google's sense: Supabase (database), Lovable (site hosting and its analytics and monitoring), Resend (e-mail), Seline (analytics, no identifiers), Apple and Google (push) act as service providers on BotolaGO's instructions, which Google's form does not count as sharing. Sponsors get only aggregated, anonymised statistics (policy section 4). |

**Data types**. For each: collected, not shared, processed not only
ephemerally.

| Google data type                                                                                    | Collected                         | Shared | Optional or required                                                                                                                  | Purposes                              |
| --------------------------------------------------------------------------------------------------- | --------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Personal info, **Email address**                                                                    | Yes                               | No     | Required (an account needs it; match pages can be read without an account)                                                            | App functionality, Account management |
| Personal info, **Name**                                                                             | Yes                               | No     | Required for an account (the display name). **Check** with the owner whether the field can be left empty; if it can, mark it Optional | App functionality, Account management |
| Personal info, **User IDs**                                                                         | Yes                               | No     | Required                                                                                                                              | App functionality, Account management |
| Personal info, address, phone, race, political or religious beliefs, sexual orientation, other info | No                                |        |                                                                                                                                       |                                       |
| Photos and videos, **Photos**                                                                       | Yes                               | No     | Optional (profile photo)                                                                                                              | App functionality                     |
| App activity, **App interactions**                                                                  | Yes                               | No     | Required (the reader cannot turn Seline off)                                                                                          | Analytics                             |
| App activity, **Other user-generated content**                                                      | Yes                               | No     | Required for Fantasy and Pronostics (team and league names, lineups, predictions)                                                     | App functionality                     |
| App activity, **Other actions**                                                                     | Yes                               | No     | Optional (favourite and followed clubs, saved articles, notification settings)                                                        | App functionality, Personalization    |
| App activity, in-app search history, installed apps                                                 | No                                |        |                                                                                                                                       |                                       |
| Device or other IDs, **Device or other IDs**                                                        | Yes                               | No     | Optional (only when the reader turns push alerts on: FCM token, random install id)                                                    | App functionality                     |
| App info and performance, **Crash logs** and **Diagnostics**                                        | Yes (while Lovable's scripts run) | No     | Required (the reader cannot turn it off)                                                                                              | Analytics, App functionality          |
| Location, financial info, health, messages, audio, files, calendar, contacts, web browsing          | No                                |        |                                                                                                                                       |                                       |

Other Play Console declarations this app will meet:

- **Target audience and content**: 18 and over only (the Terms require it,
  section 3 of the CGU; the policy's section 10). This keeps the app out of the
  Families policy.
- **Ads**: the app contains no ads. (Sponsor branding inside a page is not an ad
  network; if a sponsor banner is ever shown, answer Yes.)
- **Account deletion**: the in-app path and the web URL above.
- **News app** declaration: BotolaGO shows licensed news. It is not primarily a
  news app; answer No unless Google insists.
- **Content rating (IARC questionnaire)**: sports, no violence, no gambling,
  user-generated names visible to others, free contests with prizes.

---

## 3. Notes for the App Review team

### Text for App Store Connect, App Review Information, Notes

Paste this after filling the three bracketed values. Keep it in English.

```
BotolaGO is a free fantasy football and live-scores app for Morocco's Botola
Pro league, in French and Arabic. Users follow matches, build a Fantasy team
from real players, predict scores (Pronostics) and compete in public and
private leagues.

DEMO ACCOUNT (email and password, no two-factor code)
Email: [demo email, to be filled by the owner]
Password: [demo password, to be filled by the owner]
The account already has a Fantasy team, a favourite club and push alerts
allowed on the server side.

PUSH NOTIFICATIONS (the main native feature)
1. Sign in, open the Profile tab, then Notifications.
2. Turn on "Alertes sur ce téléphone" (Alerts on this phone). iOS shows its
   permission prompt only at this moment, never at launch.
3. Alerts are real match events: a reminder before kick-off of a match of the
   user's favourite or followed clubs, goals and full-time results of those
   matches, and Fantasy deadline reminders 24 hours and 1 hour before each
   gameweek deadline. Tapping an alert opens the related match or Fantasy page.
   During your review window the next events are: [the owner fills in the next
   kick-off and gameweek deadline, in UTC].
A screen recording of alerts arriving on a phone and opening their pages is
attached.

NATIVE FEATURES BEYOND THE WEBSITE
- Push alerts with per-topic settings (match alerts, Fantasy reminders) and
  tap-to-open on the right screen; two Android notification channels; alerts
  shown while the app is open.
- Native share sheet that shares the generated card image as a file, and
  "Save to Photos" (add-only permission) for Fantasy recap and player cards.
- An offline screen with a retry button when there is no connection.
- Status bar that follows the app's light or dark theme; portrait layout fitted
  to the notch and home indicator.

SIGN-IN
Inside the app, sign-in is email and password only; no third-party or social
login is offered in the app, so Sign in with Apple is not required.

ACCOUNT DELETION
Profile tab > scroll to "Supprimer le compte" > "Supprimer mon compte" >
tick the confirmation > "Supprimer définitivement". The account is closed
immediately and erased within 7 days. Please do not delete the demo account.

NO GAMBLING, NO PURCHASES
The app is free. There are no in-app purchases, no bets, no deposits and no
paid entry anywhere. Fantasy and Pronostics are skill games. Some Fantasy
rankings may carry prizes provided by the developer; entry is free, the
official rules are in the app (Fantasy > Prizes > Rules, /prizes/terms), and
they state that Apple is not a sponsor and is not involved in any way.

USER CONTENT
Usernames, team names and league names are visible to others. Each one has a
"Signaler" (Report) action that sends a report to support@botolago.com, and
the Terms forbid abusive names; offending names are removed.

Contact: support@botolago.com
```

Before pasting, read the bracketed items and section 4 below: the demo
account, the push settings and the screen recording must exist first, and the
"Rules" path must match what the app shows that day.

### Facts behind each paragraph

- **What the app is**: CGU section 1 and 5 (`src/content/legal/documents.ts`).
- **Demo account**: email and password, as in-app sign-in is email only. The
  account must not have two-factor authentication: with it, the push
  registration itself asks for the code (`assert_mfa_step_up` in
  `api.register_my_notification_device`). Create it in production, confirm its
  e-mail, finish the profile (display name, username, favourite club), save a
  Fantasy team, and follow one or two clubs that play during the review week.
- **How a reviewer sees a push**: there is **no "send me a test alert" button**
  and no way to trigger an alert on demand; alerts come only from real moments
  (`docs/backend/PUSH_NOTIFICATIONS.md`, "What exists"). The kick-off reminder
  goes to readers whose favourite, followed or subscribed club plays within the
  hour; the 24-hour and 1-hour deadline reminders go to readers with Fantasy
  reminders on. A review can easily fall on days with no match, so **attach a
  screen recording** (App Review Information, Attachment) of an alert arriving
  with the app closed and opening its page.
- **Testers mode and the demo account**: while push is in `testers` mode, only
  the listed accounts get anything (`PUSH_NOTIFICATIONS.md`, "What the claim
  guarantees"). The demo account must be in that list, and the command
  **replaces** the whole list (`app_private.notification_push_configure`,
  `supabase/migrations/20261005100000_push_delivery_claim.sql:126-152`, sets
  `test_user_ids = p_test_user_ids`). So the owner runs it once with every
  tester, the demo account included:
  `select app_private.notification_push_configure('testers', array['<your id>'::uuid, '<demo account id>'::uuid]);`
  This is a production write: follow `CLAUDE.md` (production rules) and
  `AGENTS.md` (one writer at a time). Or switch push to `live` before review.
  Either way the push migrations, the `notification-push-dispatch` function and
  its secrets must be in production first (`PUSH_NOTIFICATIONS.md`, "Switching
  it on").
- **Sign in with Apple (guideline 4.8)**: inside the app the Google and Apple
  buttons are hidden (`WebOnly` around them, `src/routes/auth.login.tsx:340-361`
  and `src/routes/auth.register.tsx`; reason in `src/lib/feature-flags.ts`, the
  `OAUTH_PROVIDERS_ENABLED` note). With email and password only, 4.8 does not
  apply. The brief asked for "Sign in with Apple present alongside Google":
  **that is not the situation in the app**, and should not be claimed. If
  Google sign-in is ever added inside the app, Sign in with Apple must come
  with it. One consequence to know: someone who created their account with
  Google on the website has no password; in the app they must use "Mot de
  passe oublié" first.
- **Account deletion (guideline 5.1.1(v))**: present. Profile, "Supprimer le
  compte" (`src/routes/profile.tsx:720-840`, `authService.requestAccountDeletion`
  at line 730), confirmation dialog with a checkbox; the account is closed at
  once and erased after 7 days by the `account-deletion-worker`
  (`docs/backend/ACCOUNT_DELETION_RUNBOOK.md`). The public page
  `/suppression-compte` explains it. **Check** that the deletion job is
  switched on in production (`app_private.account_deletion_settings`), or the
  "erased within 7 days" promise is not kept. `PHONE_APP.md` still lists
  "real account deletion" as open; that line is out of date since migration
  `20261006143700`.
- **Free, no gambling (guideline 5.3)**: CGU section 5 ("jeu d'adresse
  gratuit : aucun achat, aucune mise et aucun dépôt"); no purchase code in the
  app. Prize rules version 1.2 (`src/content/legal/prize-terms.ts`) were
  rewritten on 2026-10-06 for the stores: free entry, residents of Morocco,
  the organiser is **Abdelali Sarhane, the person who holds the Apple
  developer account** (line 35; Apple 5.3.2 requires the developer to be the
  sponsor), and section 9 says Apple and Google are not sponsors. What must
  still be true at submission: (a) the Apple developer account really is in
  that name (an Individual account; if it is an Organization account, the
  organiser must be that organisation); (b) the Google Play developer account
  name matches too; (c) the prizes shown on `/prizes` are the ones the rules
  describe; (d) no `mini_league` prize is switched on in `/admin/prizes`, since
  the rules do not cover it (`prize-terms.ts`, header). If prizes are not
  running yet, say so in the notes instead of the prize sentence.
- **User content (guideline 1.2)**: the "Signaler" menu exists for team,
  league and user names (`src/components/report/ReportNameMenu.tsx`) and sends
  an e-mail. There is **no way to block another user**. Apple's 1.2 asks for a
  report mechanism, a way to block abusive users, and published contact
  details. Names are the only user content and nobody can message anyone, so
  this may pass, but it is a known risk; see blockers, item 7.

### Guideline 4.2 (more than a website): the honest case

What the app does that the website cannot, today:

1. Push alerts on the phone, with the permission asked only when the reader
   turns them on, per-topic switches, deep links to the match or
   Fantasy screen, and Android channels (`src/services/native-push.ts`,
   `src/components/native/NativePushBridge.tsx`, `src/lib/push-channels.ts`).
2. Native share of the generated picture as a file, and saving it to Photos
   (`src/lib/native-share-image.ts`, `@capacitor/share`,
   `@capacitor-community/media`). Needs a build made after 2026-10-06.
3. An offline page with retry (`mobile/www/offline.html`,
   `capacitor.config.ts` `errorPath`).
4. Status bar following the app theme, portrait lock, launch screen, icons.

This is a **thin case**. Apple regularly rejects shells around a website under
4.2, and push alone is sometimes not enough, especially if the reviewer never
sees one arrive. Cheap native additions, in order of value for the review:

| Feature                                                                                                             | Why it helps                                                            | Size                                                                   |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| "Send me a test alert" button next to the Push switch                                                               | The reviewer sees a real push in seconds, whatever the match calendar   | Medium: a new push type and an RPC; backend lane (migration, function) |
| Haptics (`@capacitor/haptics`) on saving a Fantasy team, confirming a transfer, a prediction saved, pull to refresh | Feels native at once; a few lines where the success toasts already fire | Small; needs a new app build                                           |
| App icon badge for unread notifications, cleared when the inbox is opened                                           | Visible native behaviour; the inbox count already exists                | Small to medium: the sender sets `badge`, the app clears it            |
| Android back button closing sheets and dialogs before leaving a page                                                | Expected on Android                                                     | Small (`App.addListener('backButton')`)                                |
| Home-screen quick actions ("Ma équipe", "Matchs du jour")                                                           | A native entry point                                                    | Medium; needs a plugin and a build                                     |
| Opening `botolago.com` links in the app (universal links / app links)                                               | Shared links and e-mails open the app, not the browser                  | Medium: `apple-app-site-association`, `assetlinks.json`, a listener    |

The test-alert button and haptics together would turn the review from "please
wait for a match" into "tap here". Each needs owner approval as screen work
(AGENTS.md) and a new app build.

### Age rating suggestions

- **Apple**: answer the questionnaire as it is: no violence, no sexual content,
  no profanity, no medical content, no gambling and no simulated gambling;
  user-generated content Yes (names); contests Yes if the form asks (prizes);
  unrestricted web access No (the app opens only botolago.com; outside links go
  to the browser). That gives a low rating, but the Terms limit accounts to
  adults (CGU section 3: 18 and over), so choose **18+** where the form lets you
  set a higher rating than the calculated one. A rating below the Terms' age
  would invite questions about prizes and minors.
- **Google**: IARC questionnaire answered the same way; in Target audience pick
  **18 and over** only.

### Other answers App Store Connect will ask for

- **Export compliance (encryption)**: the app uses only standard HTTPS (no
  custom cryptography). That normally means "uses exempt encryption" and then
  `ITSAppUsesNonExemptEncryption = NO` can be written into the app
  (`PHONE_APP.md`, "Running a build", step 11). It is the owner's declaration.
- **Support URL**: `https://botolago.com/fantasy/help` (or a contact page if
  you prefer); the support address is support@botolago.com.
- **Privacy policy URL**: `https://botolago.com/privacy`.

---

## 4. Remaining blockers

In order. "Owner" means only you can do it (accounts, money, legal, production);
"agent" means a coding agent can do it on a branch for you to review.

| #   | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Who                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | **Approve the privacy policy 1.4 wording** (draft PR from `claude/store-privacy-push`), set its date, merge and **Publish** in Lovable. Then fill the App Privacy and Data safety forms from sections 1 and 2.                                                                                                                                                                                                                                                                                                                | Owner                                       |
| 1b  | **Lovable's analytics and monitoring scripts** on the live site (section 1, "One finding outside the code") are not in the privacy policy: Lovable is not in the recipients table, and section 11 says the site uses only strictly necessary cookies, while `~flock.js` sets a 30-minute `session-id` cookie. Either switch them off in Lovable (if the project settings allow it), or add Lovable to the policy (hosting, audience measurement and error monitoring) and correct section 11. Decide before filing the forms. | Owner decides; agent drafts the policy text |
| 2   | **Push in production**: apply the four push migrations and the device takeover script, deploy `notification-push-dispatch`, set the FCM and APNs secrets, then `testers` mode with your id **and** the demo account id (the list is replaced, not added to) or `live` (`PUSH_NOTIFICATIONS.md`, "Switching it on"). Pause the other writers first (`AGENTS.md`).                                                                                                                                                              | Owner (production writes)                   |
| 3   | **A real phone test** of the whole push path, `PHONE_APP.md` "Trying it on a real phone", steps 1 to 11. Nothing has reached a phone yet. Record the screen while an alert arrives and is tapped: that video is the review attachment.                                                                                                                                                                                                                                                                                        | Owner                                       |
| 4   | **Demo account** in production: confirmed e-mail, profile finished, no two-factor, a Fantasy team, a favourite club and followed clubs playing during review, push allowed. Fill its e-mail and password and the next match and deadline times into the review notes.                                                                                                                                                                                                                                                         | Owner                                       |
| 5   | **Prize terms vs. store accounts**: the organiser in `prize-terms.ts` is Abdelali Sarhane; confirm the Apple developer account (and the Google Play account) is that individual. Confirm what is live on `/prizes` and that no league prize is switched on. Decide whether the review notes mention prizes.                                                                                                                                                                                                                   | Owner (decision)                            |
| 6   | **Guideline 4.2 risk**: decide whether to add native features before the first submission (a test-alert button and haptics are the best value) or to submit as is and add them if Apple rejects.                                                                                                                                                                                                                                                                                                                              | Owner decides; agent builds                 |
| 7   | **Guideline 1.2**: there is no "block this user". Decide whether to add a simple block (hide a user's names from your own views) before submission or wait for Apple's feedback.                                                                                                                                                                                                                                                                                                                                              | Owner decides; agent builds                 |
| 8   | **Account deletion job on in production**: check `app_private.account_deletion_settings` is on and `account-deletion-worker` is deployed, so "erased within 7 days" is true. Update `PHONE_APP.md` (its "Still open" list still says deletion is missing).                                                                                                                                                                                                                                                                    | Owner checks; agent updates the doc         |
| 9   | **Switched-off push tokens are kept with no time limit** (see section 1). Not a store blocker, but the table comment promises deletion within 7 days. A migration adding a daily purge would make it true; then the policy's retention row can add "et au plus 7 jours après la désactivation".                                                                                                                                                                                                                               | Agent (backend lane), owner applies         |
| 10  | **Arabic texts read by a native speaker**: the iOS permission texts, the new push alert texts, and the new Arabic policy rows in 1.4.                                                                                                                                                                                                                                                                                                                                                                                         | Owner                                       |
| 11  | **Still open from `PHONE_APP.md`**: test clubs and Gameweek state removed from production data; the share-link origin; the screen edges and status bar checked on real phones; the encryption answer.                                                                                                                                                                                                                                                                                                                         | Owner (data, phones); agent on request      |
| 12  | **Android**: the `botolago_keystore` at Codemagic (with a backup), the Play Console listing with the Data safety form, the Delete account URL, Target audience 18+, then upload the `.aab`.                                                                                                                                                                                                                                                                                                                                   | Owner                                       |

### Decisions only the owner can make

- The policy 1.4 wording and its effective date.
- Lovable's analytics and monitoring scripts: switch them off, or name them in
  the policy (and keep the Diagnostics answers at Yes).
- Whether the app is rated 18+ (recommended, to match the Terms).
- Whether to mention prizes in the review notes, and confirming the prize
  organiser matches the Apple and Google developer accounts.
- Whether to add native features (test alert, haptics, badge) and a user
  block before the first submission.
- The encryption declaration.
