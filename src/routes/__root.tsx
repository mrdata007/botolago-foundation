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
import { FirstLaunchLanguage } from "@/components/shell/FirstLaunchLanguage";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/auth/AuthProvider";
import { AuthPromptDialog } from "@/components/auth/AuthPromptDialog";
import { AuthModeBadge } from "@/components/auth/AuthModeBadge";
import { FantasyOwnedProvider } from "@/services/fantasy-owned-provider";
import { RotateCcw, Home } from "lucide-react";

function NotFoundComponent() {
  return (
    <I18nProvider>
      <NotFoundBody />
    </I18nProvider>
  );
}

function NotFoundBody() {
  const { t, dir } = useI18n();
  return (
    <div dir={dir} className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-black text-brand">{t("notfound.code")}</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{t("notfound.title")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("notfound.description")}</p>
        <div className="mt-6">
          <Link
            to="/"
            aria-label={t("state.go_home")}
            className="inline-flex items-center justify-center gap-2 rounded-md cta-brand px-4 py-2 text-sm font-medium transition-colors"
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
    <div dir={dir} className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("error.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("error.description")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            aria-label={t("state.retry")}
            className="inline-flex items-center justify-center gap-2 rounded-md cta-brand px-4 py-2 text-sm font-medium transition-colors"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            <span>{t("state.retry")}</span>
          </button>
          <a
            href="/"
            aria-label={t("state.go_home")}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
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
      {
        property: "og:title",
        content: "BotolaGO — Actualités, matchs et Fantasy du football marocain",
      },
      {
        property: "og:description",
        content: "Actualités, informations de match et Fantasy pour la Botola Pro.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800;900&family=Noto+Sans+Arabic:wght@400;600;700;800&display=swap",
      },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" dir="ltr">
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
        <AuthProvider>
          <FantasyOwnedProvider>
            <LaunchGate />
            <AuthPromptDialog />
            <AuthModeBadge />
            <Toaster />
          </FantasyOwnedProvider>
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

/**
 * Deterministic launch sequence:
 * SSR + first client render: only <Outlet /> (no splash, no language dialog)
 *   → identical markup, no hydration mismatch.
 * After mount:
 *   1. If splash not yet shown this session → show splash.
 *   2. When splash finishes → language chooser (if not already chosen).
 *   3. Otherwise → normal routes.
 * Splash and language chooser never render simultaneously.
 */
function LaunchGate() {
  const { hasChosen, isHydrated } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [splashDone, setSplashDone] = useState(true);

  useEffect(() => {
    const shown = sessionStorage.getItem("botolago.splashShown") === "1";
    setSplashDone(shown);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (splashDone) sessionStorage.setItem("botolago.splashShown", "1");
  }, [splashDone]);

  const showSplash = mounted && !splashDone;
  const showLanguage = mounted && splashDone && isHydrated && !hasChosen;

  return (
    <>
      <Outlet />
      {showLanguage && <FirstLaunchLanguage />}
      {showSplash && <SplashScreen onDone={() => setSplashDone(true)} />}
    </>
  );
}
