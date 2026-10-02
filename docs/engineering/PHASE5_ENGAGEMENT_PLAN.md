# Phase 5 — Engagement: plan (draft for the owner, 2 Oct 2026)

Nothing in this plan is built yet. **Every database change below needs the owner's
approval before it is written**, and every production change is a separate approval
after a dry run (see `CLAUDE.md`).

## The short version

Most of the plumbing for reminders and notifications **already exists in the database**
(built in July and September). What is missing is mostly the part the user sees and the
part that actually delivers a push to a phone. So Phase 5 is smaller than it first looked:

| Item | New database tables? | What is really missing |
| --- | --- | --- |
| Reminder bell on match rows | **No** | The button, an inbox to read the reminders in, and the delivery |
| Phone push notifications | **No** (tables exist) | A sender, a service worker, keys, a permission prompt |
| Follow players | **Yes, one small change** | A "player" kind of follow |
| Share cards | **No** | An image-making page and the page tags |
| Readable web addresses | **Maybe** (a `slug` per match and player) | Redirects from the old addresses |
| Pépites header and tab bar | **No** | Front-end only |

## What already exists (checked in the code today)

- **Reminder storage:** `app.notification_subscriptions` can hold a follow for a match,
  a club, a competition or a news topic. The function `api.set_my_notification_subscription`
  already turns one on or off for the signed-in user. (Step 2 added the front-end
  repository and the bell that use it; there is still **no function to read the list back**.)
- **Notification types** already include `match_starting`, `goal`, `half_time`,
  `full_time`, `lineup_available`, `followed_team_result`, `deadline_24h`, `deadline_1h`.
- **Phones:** `app.device_registrations` and a private table of push addresses exist, with
  functions to register, list and remove a device. The "sender" type list already has
  `web_push`, `fcm` and `apns`, but **only a test provider (`fixture`) is wired**.
  No service worker and no push keys exist.
- **Email:** a real email path exists (`notification-email-dispatch`), including a
  `match_starting` email one hour before the user's **favourite club** plays.
- **Inbox:** the database can list, read, dismiss and count notifications. **No inbox
  screen exists.** The top-bar bell was removed on purpose (BG-0111) until there is an
  inbox to open, so the bell comes back together with the inbox, not before.
- **Follow clubs** and **follow a Pépites player** already work end to end.
- **Sharing:** the league invite already has the phone share sheet, WhatsApp and copy.
  The only share image today is one fixed `og-image.jpg`.
- **Web addresses:** clubs already carry a `slug`; matches and players are addressed by id
  only (`/matches/<uuid>`).

## Step by step (each step is its own pull request, in this order)

### Step 0 — Check two things before building (read-only, half a day)

**Result of check 1 (done 2 Oct):** the "match starting" job, which runs about an hour before
kick-off, already counts users with a match reminder, and it creates the inbox message
(and the e-mail) for them. But it only does so for users who have **e-mail notifications
turned on** (and a confirmed e-mail). A user with a reminder and e-mail off gets nothing.
Also, no function returns a user's reminders, so the bell cannot show its state on a new
device. Two small database changes would fix both (they need approval; not written):
(a) a read function listing the user's match reminders; (b) let the "match starting" job
create the inbox message for users with a reminder even when e-mail is off.
**Status (2 Oct):** (a) is written as `supabase/migrations/20261002100000_list_my_match_reminders.sql` with a pgTAP test, in this pull request only: **not applied to production**; applying it is a separate approval, and the bell works without it. (b) is **not written**: it means rewriting a large existing job that cannot be tested locally here, so it needs its own careful pull request.
Until then the bell remembers what *this device* set, and its message offers to turn
e-mail notifications on when they are off.

1. Does the existing fan-out already create an in-app `match_starting` notification for
   people who subscribed to a match (not just for a favourite club)? If not, that is a
   small database function change (needs approval).
2. Which web host runs the site (Vercel appears on the pull requests)? The share-card
   image page and the push sender depend on it.

### Step 1 — Inbox screen (front end only)
- A "Notifications" screen listing the user's notifications (read, dismiss, "mark all
  read"), using the existing functions. Opens from a bell in the top bar and from Profile.
- Tapping a notification goes to its match, article or Fantasy page (the deep-link
  targets already exist).
- Works in French and Arabic, 375 px and 1440 px. Empty state included.
- **Why first:** the bell and every later feature need somewhere to land.

### Step 2 — Reminder bell on match rows (front end, plus one possible approval)
- A 44 px bell button at the end of each match row ("Me rappeler"), turned on and off with
  the existing function. A signed-out visitor is asked to sign in first, as with
  "Suivre" on a club.
- What the reminder does **at first**: puts a message in the inbox shortly before kick-off.
  The button's wording will say exactly that. **No claim of phone alerts until Step 3.**
- Possible approval: the two small database changes under "Result of check 1" in Step 0.
- **Built (2 Oct):** the bell on upcoming match rows (not on live, finished or
  postponed rows, nor when the kick-off time is unconfirmed). It needs no database change.
- Also: the same bell on the match page header.

### Step 3 — Real phone notifications (the big one)
- **Web push only at first** (works in Chrome and Android; on iPhone only after the user
  adds the site to the Home Screen, which is an Apple rule, not ours).
- Needs from the owner: a one-time **VAPID key pair** (we generate it, the owner stores
  the private half as a secret) and agreement on the sender: a new Edge Function
  `notification-push-dispatch`, built like the email one (claims queued deliveries, sends,
  retries, dead-letters, never logs the phone address).
- Front end: a service worker, a permission prompt that appears **only after a user
  presses a bell or turns on alerts** (never on first visit), and a settings switch that
  already has a column (`push_notifications_enabled`).
- The privacy policy gets a new version and date, as was done for analytics (Moroccan
  data-protection rules: say what is stored, why, and how to switch it off).
- A switch (feature flag) `NOTIFICATIONS_PUSH_ENABLED`, off until the owner turns it on.
- Native iOS/Android apps (FCM/APNs) are **out of scope**; the tables already allow them
  later.

### Step 4 — Follow players
- Follow a real player (not only Pépites) from the player profile and the Fantasy player
  card; the home "Mes clubs" chip gets a "Mes joueurs" sibling later.
- **Database change (approval needed):** the list of follow kinds has no "player". A new
  value has to be added **in its own migration file** (PostgreSQL rule, same as the email
  types), plus a `player_id` column and its unique index and security rules, and the
  matching pgTAP test. Generated types updated.
- What a follow produces: goal / card / lineup messages for that player, through the
  existing fan-out. Rate limits already exist per user.

### Step 5 — Share cards
- A server page that draws a card image (result, upcoming match, "my Fantasy team") at
  1200×630 for link previews and a 1080×1350 version for stories, in the brand colours
  and fonts, French and Arabic (right-to-left; Arabic letter joining must be tested,
  because image-drawing libraries often get it wrong).
- Page tags (Open Graph / Twitter) per match, club and league so a pasted link shows the
  card. A "Partager" button on the match page and result rows using the phone share sheet.
- No new tables. No personal data in the image except what the user chooses to share.

### Step 6 — Readable web addresses
- Target: `/clubs/wydad-ac` (already works through the club `slug`),
  `/matches/wydad-ac-as-far-2026-10-02`, `/fantasy/players/ayoub-elouasti`.
- Old id addresses keep working and **redirect permanently** to the readable one;
  the sitemap and the canonical tag use the readable one.
- **Possible database change (approval needed):** a unique `slug` on fixtures and players
  (with a rule for two matches on one day, and for name changes). Without it we can
  rebuild the slug from the teams and date, but a lookup by that is slower and fragile.
- Needs the SEO notes in `docs/seo/` checked first so no ranking is lost.

### Step 7 — Pépites header and tab bar (front end only)
- Use the shared header and tab bar on every Pépites page so it feels like part of the
  app. Can be done any time; it has no dependency on the others.

## Order and effort (rough)

| Step | Depends on | Size |
| --- | --- | --- |
| 0 Checks | – | small |
| 1 Inbox | – | medium |
| 2 Bell | 1 (and 0) | small–medium |
| 3 Push | 1, 2, owner keys | large |
| 4 Follow players | 3 for phone alerts | medium |
| 5 Share cards | host answer from step 0 | medium |
| 6 Readable URLs | SEO review | medium |
| 7 Pépites header | – | small |

Steps 1, 2 and 7 can ship without any database change. Steps 3 to 6 each have a
decision attached.

## Database changes that need approval (full list)
1. Step 2, maybe: let match reminders reach the fan-out.
2. Step 4: add a "player" follow (own migration file for the enum value).
3. Step 6, maybe: add `slug` to fixtures and players.
Each follows the repository rules: forward-only migration with a unique timestamp, a
pgTAP test, regenerated types, a dry run first, and only one writer at a time.

## Risks
- **Notification spam** drives uninstalls: default to one reminder per match, respect the
  existing quiet hours and daily/weekly digest settings, cap per user per day.
- **iPhone push** depends on Home Screen install; the settings screen must say so.
- **Arabic share images** need real testing before launch.
- **Changing web addresses** can lose search ranking if a redirect is missed; every old
  address needs a test.
- **Privacy:** phone push addresses are private data; they stay in the private table and
  are deleted within seven days of becoming invalid (already the table's rule).

## What the owner decides
1. Approve the order above (or reorder).
2. Step 3: approve web-push-only for now, and who holds the key pair.
3. Step 4 and Step 6: approve the two database changes when we reach them.
4. Confirm the target address shapes in Step 6.
5. Confirm "no reminder claims until phone alerts work" wording for Step 2.
