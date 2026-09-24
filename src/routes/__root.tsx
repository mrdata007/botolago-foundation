import notFoundArt from "@/assets/illustrations/not-found.webp";
import errorArt from "@/assets/illustrations/no-connection.webp";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { I18nProvider, useI18n } from "@/i18n/provider";
import { SplashScreen } from "@/components/splash/SplashScreen";
import { SPLASH_INIT_SCRIPT } from "@/components/splash/launch-splash";
import { FirstLaunchLanguage } from "@/components/shell/FirstLaunchLanguage";
import { markSplashDone } from "@/lib/launch-sequence";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/auth/AuthProvider";
import { AuthPromptDialog } from "@/components/auth/AuthPromptDialog";
import { AuthModeBadge } from "@/components/auth/AuthModeBadge";
import { FantasyOwnedProvider } from "@/services/fantasy-owned-provider";
import { ThemeProvider } from "@/theme/provider";
import { THEME_INIT_SCRIPT } from "@/theme/theme";
import { DARK_MODE_ENABLED } from "@/lib/feature-flags";
import { RotateCcw, Home } from "lucide-react";

import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { currentRelease } from "@/lib/operational-errors";

function NotFoundComponent() {
  return (
    <I18nProvider>
      <NotFoundBody />
    </I18nProvider>
  );
}

/**
 * The 404 and error screens are the two pages a visitor can reach with no
 * app shell around them, which is exactly why they used to be the two that
 * looked like a different product: the V2 `cta-brand` pill, the Tailwind
 * type ramp and `text-brand` survived here after every routed screen had
 * moved on. They now speak the kit's language like everything else.
 *
 * They deliberately stay on plain elements and `ui` class tokens rather than
 * `UiButton`/`UiLinkButton`: the error boundary renders when the router may
 * itself be the thing that failed, so nothing here should need router
 * context to paint.
 *
 * Staying off the primitives is not licence to paint something else, though,
 * so the two actions below now carry exactly what the variants they stand in
 * for carry: `variant="ink"` is an ink fill under `--ui-on-ink-plain` (which
 * is also what `UiStatePanel` puts its retry button in), and `variant="outline"`
 * is a `border-current` box in the brand foreground. The ink action was
 * `ui.surface.ink`, whose foreground is the cyan `--ui-on-ink` — a legal
 * pairing, but not the one every other button-shaped thing in the product
 * uses, which on the two screens that exist to look like the product was the
 * wrong one to differ on.
 */
const stateActionClass = cn(
  "inline-flex items-center justify-center gap-2 px-4",
  ui.space.tap,
  ui.radius.control,
  ui.text.bodyStrong,
  ui.focus,
  "transition-colors",
);

function NotFoundBody() {
  const { t, dir } = useI18n();
  return (
    <div
      dir={dir}
      className={cn("flex min-h-dvh items-center justify-center", ui.surface.page, ui.space.gutter)}
    >
      <div className="max-w-md text-center">
        <img
          src={notFoundArt}
          alt=""
          aria-hidden
          decoding="async"
          className="mx-auto mb-2 h-40 w-auto max-w-full object-contain"
        />
        {/* The one oversized figure on the screen, so it comes off the STAT
            ramp (rule 4) rather than the prose ramp with `fpl-tabular` bolted
            on: `ui.stat.hero` already carries tabular figures, the hero
            weight, the `ltr:`-only stat tightening and the flat leading, and
            `calc()` over `--ui-stat-hero` is the sanctioned way to draw the
            one number a screen is about at twice its step. The `leading-none`
            it replaces is the thing the ramp's own comment forbids: a font's
            ink does not fit inside its own em, and a clipped "404" is the
            whole screen.

            The leading is restated after the size and not by accident:
            `text-*` and `leading-*` are one group to tailwind-merge (a Tailwind
            v4 `text-base/7` sets both), so the size override silently drops
            `ui.stat.hero`'s own `leading-[var(--ui-leading-flat)]` and the
            numeral falls back to the inherited line box. Verified against
            tailwind-merge 3.5. */}
        <h1
          className={cn(
            ui.stat.hero,
            ui.tone.ink,
            "text-[length:calc(var(--ui-stat-hero)*2)] leading-[var(--ui-leading-flat)]",
          )}
        >
          {t("notfound.code")}
        </h1>
        <h2 className={cn("mt-4", ui.text.title, ui.tone.default)}>{t("notfound.title")}</h2>
        <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>{t("notfound.description")}</p>
        <div className="mt-6">
          <Link
            to="/"
            aria-label={t("state.go_home")}
            className={cn(stateActionClass, ui.surface.inkPlain)}
          >
            <Home className="h-4 w-4" aria-hidden />
            <span>{t("state.go_home")}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <I18nProvider>
      <ErrorBody reset={reset} />
    </I18nProvider>
  );
}

function ErrorBody({ reset }: { reset: () => void }) {
  const { t, dir } = useI18n();
  const router = useRouter();
  return (
    <div
      dir={dir}
      className={cn("flex min-h-dvh items-center justify-center", ui.surface.page, ui.space.gutter)}
    >
      <div className="max-w-md text-center" role="alert">
        <img
          src={errorArt}
          alt=""
          aria-hidden
          decoding="async"
          className="mx-auto mb-4 h-40 w-auto max-w-full object-contain"
        />
        <h1 className={cn(ui.text.title, ui.tone.default)}>{t("error.title")}</h1>
        <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>{t("error.description")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            aria-label={t("state.retry")}
            className={cn(stateActionClass, ui.surface.inkPlain)}
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            <span>{t("state.retry")}</span>
          </button>
          <a
            href="/"
            aria-label={t("state.go_home")}
            className={cn(
              stateActionClass,
              "border border-current bg-transparent",
              ui.tone.ink,
              "hover:bg-[color:var(--ui-surface-sunken)]",
            )}
          >
            <Home className="h-4 w-4" aria-hidden />
            <span>{t("state.go_home")}</span>
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "BotolaGO — Actualités, matchs et Fantasy du football marocain" },
      {
        name: "description",
        content:
          "Actualités, calendrier et Fantasy de la Botola Pro, avec une interface en français et en arabe.",
      },
      { name: "author", content: "BotolaGO" },
      // The commit this build came from (see vite.config.ts).
      { name: "botolago-release", content: currentRelease() },
      {
        property: "og:title",
        content: "BotolaGO — Actualités, matchs et Fantasy du football marocain",
      },
      {
        property: "og:description",
        content: "Actualités, informations de match et Fantasy pour la Botola Pro.",
      },
      { property: "og:type", content: "website" },
      // The default share picture (stadium + wordmark, 1200×630). Article
      // pages set their own og:image, which takes precedence.
      { property: "og:image", content: `${PUBLIC_SITE_ORIGIN}/og-image.jpg` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "BotolaGO" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: `${PUBLIC_SITE_ORIGIN}/og-image.jpg` },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        // Changa is the Option A display face (`--ui-font-display`): titles,
        // headings, tab labels and standalone scores, in both scripts — it
        // ships an Arabic subset. 800 is its heaviest weight.
        href: "https://fonts.googleapis.com/css2?family=Changa:wght@600;700;800&family=Manrope:wght@400;600;700;800;900&family=Noto+Sans+Arabic:wght@400;600;700;800&display=swap",
      },
      // `?v=2` makes browsers fetch the new transparent "GO" favicon instead of
      // reusing the old one they have cached. Bump it whenever the file changes.
      { rel: "icon", type: "image/png", href: "/favicon.png?v=2" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
    ],
    // BG-0081. The dark palette is keyed on a `.dark` class on <html>, and the
    // class has to be there BEFORE the first paint or the page flashes light
    // and then swaps. An effect runs after paint, so this is a tiny synchronous
    // inline script in the head instead.
    //
    // Head scripts are declared FLAT: the router builds the <script> element,
    // turns every key except `children` into an attribute, and writes
    // `children` with dangerouslySetInnerHTML. A `{ tag, attrs, children }`
    // object is not what it reads and renders nothing.
    // Gated on DARK_MODE_ENABLED: the default choice is "system", so leaving
    // this in with the control hidden would still serve dark mode to every
    // visitor whose OS prefers it.
    //
    // The splash script is the same kind of thing: whether this load opens on
    // the launch splash has to be settled before the first paint, or the page
    // shows first and the splash lands on top of it once the app has loaded.
    scripts: [
      ...(DARK_MODE_ENABLED ? [{ children: THEME_INIT_SCRIPT }] : []),
      { children: SPLASH_INIT_SCRIPT },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  // `suppressHydrationWarning` on <html>: the inline theme script (BG-0081)
  // adds the `.dark` class and a `color-scheme` style to this element before
  // React hydrates, exactly as `I18nProvider` later rewrites `lang`/`dir`.
  // Both are deliberate out-of-band writes to the document element, not drift.
  return (
    <html lang="fr" dir="ltr" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <ThemeProvider>
          <AuthProvider>
            <FantasyOwnedProvider>
              <LaunchGate />
              <AuthPromptDialog />
              <AuthModeBadge />
              <Toaster />
            </FantasyOwnedProvider>
          </AuthProvider>
        </ThemeProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

/**
 * Deterministic launch sequence:
 * SSR + first client render: the splash markup and <Outlet /> (no language
 *   dialog) → identical markup, no hydration mismatch. Whether the splash is
 *   visible is CSS, from the head script's decision, settled before the first
 *   paint (src/components/splash/launch-splash.ts).
 * After mount:
 *   1. If this load shows the splash, it plays out and leaves; if not, it is
 *      dropped at once, having never been on screen.
 *   2. When it is gone → language chooser (if not already chosen).
 *   3. Otherwise → normal routes.
 * Splash and language chooser never render simultaneously.
 */
function LaunchGate() {
  const { hasChosen, isHydrated } = useI18n();
  const [splashDone, setSplashDone] = useState(false);

  // Arrival dialogs of other pages (the prize welcome) wait for this; see
  // src/lib/launch-sequence.ts. `splashDone` only turns true after mount, once
  // the splash has left or was never up, so it can be announced as it is.
  useEffect(() => {
    if (splashDone) markSplashDone();
  }, [splashDone]);

  const showLanguage = splashDone && isHydrated && !hasChosen;

  return (
    <>
      {/* First in the document, so it is parsed, and painted, before the
          page it covers. */}
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      <Outlet />
      {showLanguage && <FirstLaunchLanguage />}
    </>
  );
}
