# Brief: save and share the share picture inside the phone app

Approved screen work (AGENTS.md, "Screen work"). Written after inspecting the
share sheet and before the first interface change. The phone app is the
Capacitor shell in `capacitor.config.ts`, which opens the live site.

The share sheet (`src/components/common/ShareImageSheet.tsx`) is used by the
Pépites cards (week Top 10, a player's card) and the Fantasy gameweek recap.
Inside the app today, "Télécharger l'image" is hidden (`WebOnly`: neither
shell handles a file download), and the system share button only shows where
`navigator.canShare({ files })` says yes, which Android's WebView never does.
So on Android the picture cannot be kept or sent as a file at all; on iPhone
only through the web share sheet.

## What must be preserved

- Everything a browser visitor sees and does today: the web share button (when
  the browser can share files), "Télécharger l'image", WhatsApp and "Copier le
  lien", in that order, with the same labels and the same analytics events.
- Apps already installed (built before this change) load the same live site
  but do not contain the new native plugins. There, nothing changes either: no
  new button may appear that would do nothing. iPhone keeps its web share
  button.
- The server render and the first client render stay identical (no hydration
  mismatch). The new buttons only exist inside the app, so they are added after
  mount, the way `useInNativeApp` already works; nothing is hidden by them.
- The analytics events stay the same five (`preview`, `native`, `whatsapp`,
  `copy`, `download`). Saving to the gallery is the app's way of keeping the
  picture, so it reports `download`; the native share reports `native` only
  when the phone says it was sent (a cancel is not a share).
- The design system (DESIGN_SYSTEM_V2.md): kit primitives and `ui.*` tokens,
  44px targets, French and Arabic with RTL.
- Business rules, the brand, account deletion (another lane), the database:
  untouched. No migration.

## Improvements

1. **"Enregistrer dans la galerie" / "حفظ في معرض الصور" inside the app.**
   Saves the picture to the phone's Photos (iPhone, add-only permission: the
   app can add a photo but never sees the library) or gallery (Android, in a
   BotolaGO album, with no storage permission on any Android version). Uses
   `@capacitor-community/media`. Shown where "Télécharger l'image" sits in a
   browser, with the same look.
2. **"Partager l'image" works inside the app on Android and iPhone.** The
   picture is written to the app's cache (`@capacitor/filesystem`) and handed
   to the phone's share sheet with the message and the link
   (`@capacitor/share`).
3. Each button shows only when its plugin is really in the running app
   (`Capacitor.PluginHeaders`, what `Capacitor.isPluginAvailable` reads), so an
   older app build shows exactly what it shows today.
4. Feedback through the existing toasts: "Image enregistrée dans la galerie" on
   success; on a refused photo permission, where to allow it; otherwise a short
   failure message. A cancelled share says nothing.
5. Native side (`scripts/mobile/prepare-native.mjs`): the iPhone text for adding
   to Photos (`NSPhotoLibraryAddUsageDescription`, French in `Info.plist`,
   French and Arabic in `InfoPlist.strings`), and the file timestamp entry the
   Filesystem plugin needs in the privacy manifest
   (`NSPrivacyAccessedAPICategoryFileTimestamp`, reason `C617.1`). Android needs
   no new permission.

## Acceptance criteria

Functional

- In a browser (no bridge), the sheet is unchanged: same buttons, same order,
  and the server HTML is the same as before.
- With a bridge stub and no new plugins (an older app build): no save button,
  no download link; on iPhone the web share button still shows when
  `navigator.canShare` allows it; on Android no share button.
- With a bridge stub and the plugins: "Partager l'image" and "Enregistrer dans
  la galerie" show on both phones; the save calls the Media plugin with the PNG
  (Android: into the BotolaGO album), the share writes the PNG to the cache and
  calls the Share plugin with that file, the message and the link.
- Toasts in French and Arabic for saved, permission refused and failure.
- Unit tests for the availability check and the save/share logic; `bun test`,
  `bun run typecheck`, eslint and prettier on touched files, `bun run build`.
- `bun run mobile:prepare` on freshly created iOS and Android projects, twice
  (the second run changes nothing), `bun run mobile:check`, and `cap sync`
  registers the three plugins in both projects.

Visual

- Before/after screenshots of the share sheet at 390x844 and desktop, French
  and Arabic (RTL), in app mode (Android and iPhone bridge stubs with the
  plugins) and in a browser, in `docs/engineering/briefs/in-app-image-save-share/`.
- The new button looks like the browser's download link (same secondary
  style), keeps a 44px target and does not overflow at 390px.
