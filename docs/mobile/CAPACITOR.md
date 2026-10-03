# BotolaGO phone app (Capacitor)

## How it works

BotolaGO renders pages on the server, so the phone app does not carry its own
copy of the site. It is a native shell that opens **https://botolago.com**
full-screen. Every deploy of the website updates the app at once; a store
release is needed only for native changes (icon, name, permissions, plugins).

- `capacitor.config.ts` — app id `com.botolago.app`, name, the site address,
  and which addresses may open inside the app (others open in the browser).
- `capacitor/www/index.html` — the page shown when the phone is offline.
- `src/lib/native-shell.ts` — app-only behaviour (Android back button). It does
  nothing on the website.

## First-time setup (on your own computer)

Android needs Android Studio; iOS needs a Mac with Xcode.

```sh
bun install
bun run cap:add:android   # creates android/
bun run cap:add:ios       # creates ios/ (Mac only)
bun run cap:android       # opens the project in Android Studio
bun run cap:ios           # opens the project in Xcode
```

Commit the generated `android/` and `ios/` folders. After changing
`capacitor.config.ts` or adding a plugin, run `bun run cap:sync`.

To point the app at staging or a dev server on your network instead of the
live site:

```sh
CAP_SERVER_URL=http://192.168.1.20:8080 bun run cap:sync
```

## Before publishing to the stores

1. **Icons and splash** — generate them from one 1024×1024 logo:
   `bunx @capacitor/assets generate` (put the logo at `assets/icon.png`).
2. **Sign-in links** — email confirmation and password-reset links point to
   `https://botolago.com/auth/callback`. They open in the phone's browser, not
   the app, until app links are set up (Android `assetlinks.json`, iOS
   `apple-app-site-association` under `/.well-known/`). Google/Apple sign-in
   inside the app has the same limit.
3. **Apple review** — Apple can reject apps that are only a website in a
   wrapper (guideline 4.2). Native features (push notifications, share sheet)
   make approval much more likely.
