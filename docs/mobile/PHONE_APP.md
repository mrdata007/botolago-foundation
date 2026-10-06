# The BotolaGO phone app

Status: **the web side is built and tested, and the cloud build runs.** An iPhone
build was uploaded to App Store Connect on 2026-10-05, and an Android test `.apk`
was built. The Android build now makes the signed Google Play bundle instead, which
needs the `botolago_keystore` at Codemagic first (step 6 below). The app's icon,
launch screen, Android notification icon, Apple privacy manifest and photo
permission texts are now added on every build; none of that has been seen on a
real phone yet (see "What was checked without a phone or a build").

## What it is

A thin native shell (Capacitor) around the live site, `https://botolago.com`. The
site is server-rendered, so there is no static copy to put inside the app: the
shell opens the website, and a site fix reaches the app at once. What the shell
adds is what a web page cannot do on a phone. Today that is **push alerts**:
asking permission, getting the phone's address from Apple or Google, and opening
the right page when an alert is tapped. The sending side is described in
`docs/backend/PUSH_NOTIFICATIONS.md`.

Because the shell loads the live site, **the push code the phone runs is whatever
is deployed at botolago.com**. Deploy the branch before testing an app build.

## What is in the repository, and what is not

| In the repository                                                           | Where                                                                                                   |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| The shell's settings: app id, name, the site it opens, foreground alerts    | `capacitor.config.ts`                                                                                   |
| The page shown when the site cannot be reached (French and Arabic)          | `mobile/www/offline.html`                                                                               |
| Knowing whether the page is inside the app, and on which phone              | `src/lib/native-app.ts`                                                                                 |
| Permission, the phone's address, registering and releasing this phone       | `src/services/native-push.ts` (rules, tested), `src/services/native-push-runtime.ts` (the real plugins) |
| The Push switch in the profile's notification settings (app only)           | `src/routes/auth.profile-setup.tsx` step 3, `src/services/use-native-push.ts`                           |
| Opening an alert's page, refreshing the inbox, keeping the phone registered | `src/components/native/NativePushBridge.tsx`, `src/lib/push-payload.ts`                                 |
| Android alert channels (so a goal appears on screen)                        | `src/lib/push-channels.ts`, and the sender's `supabase/functions/_shared/notification-push-types.ts`    |
| Saving a share picture to the photos, and sharing it as a file (app only)   | `src/lib/native-share-image.ts`, `src/components/common/ShareImageSheet.tsx`                            |
| Finishing the native projects after `cap add`                               | `scripts/mobile/prepare-native.mjs` (`bun run mobile:prepare`, `bun run mobile:check`)                  |
| The app's icons, launch screens and Android notification icon               | `store-assets/app-icon/native/`, made by `scripts/brand/make-app-icons.py`                              |
| Numbering each build for the stores                                         | `scripts/mobile/set-build-number.mjs`                                                                   |
| The cloud build of the iPhone and Android apps                              | `codemagic.yaml`                                                                                        |

Not in the repository: the `ios/` and `android/` folders. The cloud build creates
them on every build (`cap add`) and finishes them with the scripts above, so there
is one source of truth and no stale native code. The Firebase file
`google-services.json` is kept out of git on purpose (`.gitignore`) and given to
the build through a Codemagic secret.

## Building without a Mac: Codemagic

An iPhone app can only be built on a Mac, so the build runs on Codemagic's
(https://codemagic.io). Its free plan advertises 500 minutes a month on the Mac
machines the build file uses; one build takes roughly 10 to 20. Builds start only
when you press **Start new build**: nothing starts on a push. Nothing is released:

- **iPhone** (`ios` workflow): signs the app with your Apple account and uploads
  it to App Store Connect, where it appears in **TestFlight for your own team**. It
  is not sent to Apple's review and not released.
- **Android** (`android` workflow): makes a signed `.aab` (what Google Play takes)
  and a signed `.apk` (to install on a phone) and keeps them as downloads. Both are
  signed with the `botolago_keystore`. It does not publish to Google Play: you
  upload the `.aab` in the Play Console yourself.

### One-time set-up

You need the Apple Developer account and the Firebase project you already made the
push keys in. The app id is **`botolago.com`**, the App ID registered at Apple. It
must be the same everywhere it appears: the App ID at Apple, `capacitor.config.ts`,
`codemagic.yaml` (a test checks those two agree), the sender's `APNS_BUNDLE_ID`
secret (`botolago.com`, Apple's push topic) and, for Android, the package name
Firebase has for the Android app. (A second App ID, `com.botolago.app`, also exists
at Apple. Nothing here uses it; leave it or delete it.)

**At Apple (developer.apple.com and appstoreconnect.apple.com)**

1. Certificates, Identifiers & Profiles, Identifiers: open `botolago.com` (create
   it as an explicit App ID if it is missing) and make sure **Push Notifications** is
   ticked. Save. Without this the build's signing has no push permission and the
   phone never gets an address.
2. App Store Connect, Apps, **+ New App**: iOS, name BotolaGO, primary language
   French, bundle id `botolago.com`, any SKU. Codemagic can only upload to an app
   that exists.
3. App Store Connect, Users and Access, Integrations, App Store Connect API, **Team
   Keys**, **+**: name it "Codemagic", access **App Manager**. Download the `.p8`
   file (you can only do it once) and note the **Key ID** and the **Issuer ID** shown
   on that page. This is a different key from the push key.

**At Codemagic**

4. Sign in with GitHub, **Add application**, pick `mrdata007/botolago-foundation`,
   and choose the `codemagic.yaml` configuration. Use the branch the work is on
   (`claude/sleepy-faraday-8w6ml4`) until it is merged, then `main`.
5. Teams, your team, **Integrations**, Developer Portal, **Connect**: name it exactly
   `botolago_app_store_connect`, and give it the Issuer ID, the Key ID and the `.p8`
   file from step 3.
6. Teams, **Code signing identities**, Android keystores: **generate** a keystore (or
   upload one) with the reference name exactly `botolago_keystore`. Do this before
   the next Android build: without it the build stops at once with "No keystores
   with reference 'botolago_keystore'". **Download a backup of it and keep it
   safe:** it is what signs every Android update, and Google Play refuses an update
   signed with another key. (In the Play Console, keep "Google Play App Signing" on:
   this keystore is then your upload key, and Google can reset a lost upload key.)

**Firebase (console.firebase.google.com)**

7. Project settings, Your apps: the Android app must exist with the package name
   `botolago.com` (add it if not: a package name cannot be changed afterwards, so if
   the Android app there has another name, add a second Android app with this one).
   Download the `google-services.json` of that app.
8. Turn that file into one line of text, then save it as a **secure** variable at
   Codemagic: in the app's **Environment variables**, in a group named exactly
   `botolago_mobile`, a variable named exactly `GOOGLE_SERVICES_JSON_BASE64`.
   - Mac or Linux: `base64 -w0 google-services.json` (on a Mac: `base64 -i google-services.json`)
   - Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("google-services.json"))`

The names above (`botolago_keystore`, `botolago_mobile`,
`botolago_app_store_connect`, `GOOGLE_SERVICES_JSON_BASE64`) are the ones
`codemagic.yaml` asks for; change one and the build stops with a clear message.

### Running a build

9. Codemagic, your app, **Start new build**: pick the branch and the workflow
   (`android` or `ios`).
10. **Android**: when it finishes, open the build's **Artifacts** and the `.apk` link
    on the phone (allow installing from the browser when it asks). The `.aab` is the
    file for the Play Console.
11. **iPhone**: when it finishes, wait for App Store Connect to process the build
    (often 10 to 30 minutes), then TestFlight, Internal Testing: add yourself, install
    Apple's **TestFlight** app on the iPhone and open BotolaGO from there. App Store
    Connect may ask an **encryption** question for the build ("Missing Compliance").
    The app only uses standard HTTPS, but that is a declaration for you to make, not
    something this repository decides. Once you have answered it, the answer can be
    written into the app (`ITSAppUsesNonExemptEncryption` in `Info.plist`, added by
    `prepare-native.mjs`) so App Store Connect stops asking for every build; ask for
    it then.

A failed build shows its log on the build page; send it to whoever is fixing it.

### What the build does, so a failure is easy to place

1. Installs the project's packages from the lockfile.
2. `cap add android` or `cap add ios`, then `bun run mobile:prepare`, then
   `bun run mobile:check`, which stops the build if anything the app needs is
   missing. On Android it writes `google-services.json` first.
3. Numbers the build (`set-build-number.mjs`): Codemagic's build number, and the
   version people see (`APP_VERSION` at the top of `codemagic.yaml`, `1.0.0`).
4. `cap sync`, then signs and builds (`xcode-project use-profiles` and `build-ipa`,
   or `./gradlew bundleRelease assembleRelease`). The Android step first checks that
   Codemagic gave it the keystore (`CM_KEYSTORE_PATH`), and stops with a message
   if not.

`bun run mobile:prepare` is safe to run again, and adds only what Capacitor's
templates leave out:

- **iPhone**:
  - the two methods in `AppDelegate.swift` that pass Apple's token to Capacitor;
    `App.entitlements` declaring push, and the Xcode project's setting that points
    at it (what Xcode's "+ Capability, Push Notifications" does). The entitlement
    says `production`, because every build the cloud makes is a TestFlight or App
    Store one, which is also what the sender's `APNS_ENVIRONMENT` defaults to;
  - **iPhone only**: `TARGETED_DEVICE_FAMILY = 1` in the app's Debug and Release
    settings, so App Store Connect does not ask for iPad screenshots;
  - **upright only**: the screen does not turn sideways (when this was set, the
    site handled the notch only at the top and bottom);
  - `Info.plist`: French as the app's language and Arabic as the second one, and
    the texts iOS shows when the profile photo picker asks for the camera or the
    photos (without the camera text, iOS closes the app when someone picks "Take
    Photo"). The same texts in Arabic are in `ar.lproj/InfoPlist.strings`;
  - the text iOS shows when the app asks to **add a picture to Photos**
    (`NSPhotoLibraryAddUsageDescription`), in French in `Info.plist` and in French
    and Arabic in `InfoPlist.strings`. It is used by "Enregistrer dans la galerie"
    and by "Save Image" in the phone's share sheet. Without it iOS closes the app
    at that moment;
  - `PrivacyInfo.xcprivacy`, Apple's privacy manifest, added to the app's
    resources. It declares the two "required reason" APIs the app uses:
    `UserDefaults`, by `@capacitor/preferences`, reason `CA92.1` (data only the app
    reads), and file dates, by `@capacitor/filesystem`, reason `C617.1` (files in
    the app's own folders). No tracking. Its list of collected data is left empty: what the app
    collects is what the website collects, and you declare that in App Store
    Connect's App Privacy form, following the privacy policy;
  - the **icon** (the AppIcon set) and the **launch screen** image (the GO mark on
    the icon's light grey-white, `#F2F5FA`).
- **Android**:
  - `POST_NOTIFICATIONS` in `AndroidManifest.xml` (without it Android 13 and later
    never show the permission prompt);
  - the **notification icon**: a white GO on a transparent background
    (`ic_stat_notify`) and its colour, BotolaGO blue, named in the manifest.
    Firebase draws every alert with them, whether the app is open or closed;
    without them Android shows a white square;
  - **upright only**, like the iPhone;
  - the **file provider** that hands the share picture to other apps, with the
    app's cache in its paths. Capacitor's template already has both; the script
    only checks them. No new permission: saving to the gallery needs none;
  - the **icon**: the adaptive icon (background, foreground, and the one-colour
    layer phones tint to match the wallpaper) and the flat icons older phones
    use, at every size;
  - the **launch screen**: the GO mark on `#F2F5FA`, on every Android version
    (`styles.xml`), and Capacitor's launch images replaced;
  - the release signing from the keystore Codemagic provides (`CM_KEYSTORE_*`;
    unset on a developer machine, which then builds an unsigned release).

Capacitor 8's Android template already targets API 36.

The icons and launch screens are committed, ready-made, in
`store-assets/app-icon/native/`, laid out as they go into the projects; the build
copies them as they are. They are made by `scripts/brand/make-app-icons.py`, the
same script as the store icons: to change them, change it and run it again
(`store-assets/app-icon/README.md`). The build needs no Python.

### If you ever have a Mac or Android Studio

The same steps by hand, from the repository root: `bun install`, `bunx cap add ios`
and/or `bunx cap add android`, `bun run mobile:prepare`, copy `google-services.json`
into `android/app/`, `bunx cap sync`, then open `ios/App/App.xcodeproj` in Xcode or
`android/` in Android Studio. `bun run mobile:check` says what is still missing.

## Apple's two push servers

Apple has a sandbox and a production push server. A build run from Xcode on a cable
gets a **sandbox** address; a TestFlight or App Store build gets a **production**
one. The sender uses production unless its `APNS_ENVIRONMENT` secret says `sandbox`,
and every cloud build is a TestFlight build, so the default is right and nothing
needs changing. (Only if someone later installs a cabled Xcode build does the
sender answer `BadDeviceToken` and turn that phone off.)

## How it behaves

- **The permission prompt appears only when the reader turns the Push switch on**
  (profile, Notifications), never at launch and never on another screen. If the
  phone's answer is "no", the switch stays off and the app says to allow it in the
  phone's settings (the phone does not ask twice).
- **The switch belongs to the account**, like the e-mail one: it covers every
  phone the account has registered. A phone that was never asked (or said no) shows
  Off and asks when it is turned on there.
- **Registration is kept fresh**: while the account has push on, the phone's
  registration is renewed when the app starts and when it comes back to the front
  (at most every 30 minutes). It never prompts.
- **Signing out lets this phone go**: its registration is deleted first. It is
  best effort and never holds a sign-out back. If it fails (offline), nothing is
  lost: a phone's address belongs to whoever presents it (migration
  `20261005140000`), so the next account to register on that phone takes the
  address over, and the registration that held it is switched off (its history
  stays; the move is in the operational audit as `notification_device_taken_over`,
  without the address). The same happens after a reinstall, which gets a new
  install id but, on iPhone, the same address.
- **Tapping an alert opens its page** (the match, the Fantasy transfers). An
  alert received while the app is open is shown by the phone and refreshes the
  inbox. An alert whose page the app does not recognise opens nothing.
- **Android alert channels**: the app creates two high-importance channels,
  "Alertes match" and "Rappels Fantasy", and the sender names them so a goal
  appears on screen. Their ids (`match_alerts`, `fantasy_reminders`) must never
  change once an app is out.
- In a browser none of this is visible: the switch only exists inside the app.

## Saving and sharing pictures

The share sheet of the Pépites cards and of the Fantasy recap makes a picture.
A web page cannot save a file inside the app, and Android's web view cannot
share one. So the app uses three plugins:

- `@capacitor-community/media` (9.1.0) saves the picture. "Enregistrer dans la
  galerie" replaces the browser's "Télécharger l'image".
  - iPhone: it goes into the camera roll. iOS asks once, for "add only" access:
    the app can add a photo, never see the others.
  - Android: it goes into a "BotolaGO" album in the app's own media folder. No
    permission is asked, on any Android version. The gallery shows the album.
    Android deletes it if the app is uninstalled.
- `@capacitor/filesystem` (8.1.4) writes the picture to the app's cache.
- `@capacitor/share` (8.0.3) opens the phone's share sheet with that file, the
  message and the link. "Partager l'image" uses it on both phones.

The versions are pinned in `package.json`. The plugins are native code, so
**this needs an app build made after they were added.** An older build loads
the same site without them. There the site shows what it showed before: no
save button, and on iPhone the web share button. The site asks the app which
plugins it has (`nativePluginAvailable` in `src/lib/native-app.ts`) before
showing a button. A refused photo permission shows a message saying where to
allow it. A closed share sheet says nothing.

## Trying it on a real phone

Nothing below has been done. In this order, on a test account:

1. Deploy the branch to botolago.com. Apply the push migrations and set the sender's
   secrets as in `PUSH_NOTIFICATIONS.md`, with push in `testers` mode for your
   account only.
2. Install the app (Android: the `.apk`; iPhone: TestFlight). Sign in. Profile, Notifications: the Push switch is there, Off.
3. Turn it on: the phone's permission prompt appears, then the switch stays on.
   Check in the database that the phone is registered:
   `select platform, push_provider, enabled, app_version from app.device_registrations where user_id = '<id>';`
   (one row, `fcm` on Android, `apns` on iPhone, `enabled`).
4. Refuse the prompt on a second install: the switch stays off, a message says
   where to allow notifications.
5. Make an alert happen: a match kicking off within the hour whose club is your
   favourite is the easiest (the kick-off reminder), or a goal in a live match you
   follow. The alert should arrive with the app closed, and tapping it should open
   that match.
6. Turn the switch off: the registration is `enabled = false` and no alert arrives.
7. Sign out: the registration row is gone.
8. Airplane mode, then open the app: the offline page appears with a retry button.
9. Arabic: switch the language and check the Push row and the alert text read
   correctly right to left. (The Arabic wording of the new alerts has not been read
   by a native speaker.)
10. The app itself: the BotolaGO icon on the home screen (on Android 13 and later,
    also with themed icons on), the GO mark on a light background at launch, the
    white GO in the status bar when an alert arrives, the screen staying upright
    when the phone turns, and, in the profile, the photo button: "Take Photo" asks
    for the camera with the French text (Arabic on a phone set to Arabic).
11. Pictures (an app build made after 2026-10-06): open Pépites, the share
    button, then "Enregistrer dans la galerie". iPhone: allow "add photos";
    the picture is in Photos. Android: no prompt; the picture is in the
    gallery's BotolaGO album. Then "Partager l'image": the phone's share sheet
    opens with the picture; send it to WhatsApp. On iPhone, also try "Save
    Image" in that sheet. Refuse the photo permission once and check the
    message.

**What was checked without a phone or a build:**

- The rules in `native-push.ts` and the page mapping in `push-payload.ts`, by unit
  tests (each rule deliberately broken to see a test fail), and the whole flow in a
  desktop browser against a stand-in for Capacitor's bridge: permission asked once,
  registration, tap opens the page, off, sign-out, refusal, Android channels, French
  and Arabic, and no Push row in a plain browser.
- The build's setup, replayed command by command in the order `codemagic.yaml` runs
  them, on freshly created Android and iPhone projects (`cap add` does work on
  Linux): the helper's changes were inspected in the generated Xcode project (the
  push setting in the app target's two configurations only), the Gradle file and the
  manifest, the build number lands in both, and a second run changes nothing.
- The store-readiness additions (2026-10-06), the same way, on projects from
  Capacitor 8.5.2's templates, with `cap sync` run afterwards: the icons and launch
  images in both projects are byte for byte the committed ones and cover every
  file Capacitor's template had; the Xcode project parses, every object it names
  exists, the privacy manifest and the `InfoPlist.strings` are in the app's
  resources, and the app target's Debug and Release say iPhone only; `Info.plist`
  and `PrivacyInfo.xcprivacy` parse as property lists; the manifest has the
  notification icon, its colour and portrait; `bun run mobile:check` passes after
  `cap sync` and the build number; a second `mobile:prepare` changes nothing.
  Every patch has a unit test, and ten of the changes were broken on purpose to
  see a test fail.
  The Android resources and manifest were also linked with Google's `aapt2`
  (against Android 36 and the splash screen library, without the rest of the app),
  which resolves every name they use: it passed, and failed on a misspelt one.
- Saving and sharing pictures (2026-10-06): fresh projects from Capacitor
  8.5.2's templates list the three plugins after `cap add` and `cap sync`
  (iPhone: `CapApp-SPM/Package.swift` and `packageClassList`; Android:
  `capacitor.settings.gradle`, `capacitor.build.gradle` and
  `capacitor.plugins.json`). `mobile:prepare` adds the photo text and the
  privacy entry; a second run changes no file; `mobile:check` passes. The
  plugins' own Android manifests are empty, so no permission is added. In a
  browser, against a stand-in for the bridge with and without the plugins:
  the buttons, what each plugin is sent, the toasts in French and Arabic, and
  the older-build case. Not tried: a real phone, a real Photos or gallery
  write, a real share sheet, and an Xcode or Gradle build.
- `codemagic.yaml` parses, and a test holds that every command in it exists, that
  the steps run in the order they need, that the app id matches
  `capacitor.config.ts`, that it holds no secret, and that it cannot release anything
  (no triggers, no review, no store, no Google Play).

**What was not checked:** the Gradle signing block and a whole Android build
under a real Gradle; the Xcode project (privacy manifest, `InfoPlist.strings`,
iPhone only) under a real `xcodebuild`; how the icons and launch screens look on a
real phone; how Codemagic reads the file (its shared-settings syntax,
`xcode: latest`, the machine type), signing, the upload to App Store Connect,
Apple's and Google's servers, real tokens, real delivery, and any real phone. The stand-in for Capacitor's bridge is not Apple or Google.

## Screen edges: notch, status bar and home indicator

The shell draws the site under the status bar and the home indicator (iPhone) or
the system bars (Android 15 and later), and the site pads itself clear of them.
That works only because the site's viewport meta says `viewport-fit=cover`
(`src/routes/__root.tsx`, added with the store readiness work; BG-0151). Without
it, iOS reports every `env(safe-area-inset-*)` as 0, so the site's safe-area
padding never switches on, and Capacitor's Android `SystemBars` keeps the page
boxed in.

What pads itself by the insets:

- the top bar and every screen header (`ui.safe.top`), the bottom navigation and
  sheets (`ui.safe.bottom`), and the bars placed under or above them
  (`--topbar-h`, `--bottomnav-h`);
- the bottom bars that do not sit above the navigation (the Fantasy player
  page's actions, the bars that drop to the bottom edge from 768px wide, the
  Landing page's button), the Pépites reveal, toasts, the reading-progress bar,
  side and top sheets, and centred dialogs;
- on Fantasy inner screens, the sign-in screens and the Landing page (`/jouer`),
  a strip exactly as tall as the status bar (`StatusBarStrip`), so scrolled
  content does not show under the clock: in the header's surface on Fantasy, in
  the dark band's ink-deep on the other two (BG-0154);
- in landscape, the page itself (`body`), padded on both sides by the larger side
  inset, so content keeps clear of the notch. The app stays upright, so this is
  for the website on a notched iPhone turned sideways.

Every inset is 0 in an ordinary browser window, so the website does not change
there. `capacitor.config.ts` also sets `SystemBars.initialViewportFitValueHint:
"cover"`, an Android-only hint that avoids a jump on first paint. Like any change
to that file it needs a new native build; the site changes reach the app on
Publish.

This was checked only in Chromium with emulated insets. To check on the first
builds, in French and Arabic: a notched or Dynamic Island iPhone, an Android 15+
phone with WebView 140 or later and one with an older WebView, and the website in
Safari on a notched iPhone, upright and sideways.

The status bar's clock and icons follow the theme the app shows, not the
phone's light or dark setting (BG-0154, `src/lib/system-bars.ts`): at start-up,
when the reader picks Clair or Sombre, and when the phone changes while Système
is chosen, the site calls Capacitor 8's built-in `SystemBars.setStyle` (part of
`@capacitor/core`, no plugin to add and no native change). Dark icons on the
light theme, light icons on the dark theme; Capacitor names the style after the
background, so light icons are `SystemBarsStyle.Dark`. The sign-in screens, the
Landing page and the launch splash have a dark top in both themes and keep light
icons while they are on screen. On Android the navigation bar follows the theme
too; on iPhone the home indicator colours itself. iOS needs
`UIViewControllerBasedStatusBarAppearance` set to YES in `Info.plist`, which
Capacitor 8's template already does. Nothing is loaded or called in a browser.
This was checked with unit tests and in Chromium with a stand-in for the phone's
bridge, not on a phone: it is part of the device check above.

## Still open before a store submission

Not part of the push work, and not done here: Google's sign-in is refused inside a
web view and sign-in links open in the system browser, so the app needs its own
sign-in redirect handling; real account deletion with a stated timeline and
confirmation; the prize terms; removing test clubs and Gameweek state from
production data; the share-link origin; checking the screen edges on real phones
(see "Screen edges" above, which includes the status bar following the app's
theme); the privacy policy and store forms (push is not yet in
the policy's purposes, and phone tokens have no row in its retention table; App
Store Connect's App Privacy form and Google Play's Data safety form are filled by
hand, from the policy); the Arabic permission texts, not yet read by a native
speaker; and Apple's rule against thin web wrappers (the app must offer more than
the website: push alerts count, and should be demonstrable to the reviewer).
