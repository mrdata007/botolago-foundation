// The MCP OAuth consent screen: an app asks to act as the signed-in reader.
//
// Option A typography and cards, in place of the generated page's shadcn V1
// tokens (`cta-brand`, `rounded-xl`, `text-muted-foreground`) and its
// English-only copy: one feature card on the flat page — the wordmark, the
// request as a display heading, what it allows, the requested scopes in a
// sunken card as the identifiers the server sent (left to right in Arabic
// too), then the decision as the gradient pill and the white one. Behaviour
// is unchanged: same guard, loader, approve/deny calls and redirects, and a
// failure still shows the server's own message.
//
// Deliberately NOT on `AuthShell`. This route is `ssr: false` and sends a
// signed-out reader to `/auth/login` from `beforeLoad` while the page
// hydrates. Sharing the shell meant its modules were already loaded when
// that redirect ran, so the lazy login screen rendered at once into the
// server's empty shell: a hydration mismatch on every visit (measured 6/6;
// 0/6 without the shell). Kit primitives are loaded with the app anyway.

import type { ReactNode } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { secondFactorGuard } from "@/auth/second-factor";
import { authOutlineClass } from "@/components/auth/auth-classes";
import { Logo } from "@/components/brand/Logo";
import { ui, UiAlert, UiButton, UiCard } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface AuthorizationDetails {
  client?: { name?: string; client_id?: string; redirect_uri?: string };
  scopes?: string[];
  redirect_url?: string;
  redirect_to?: string;
}

interface OAuthApi {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{
    data: { redirect_url?: string; redirect_to?: string } | null;
    error: { message: string } | null;
  }>;
  denyAuthorization: (id: string) => Promise<{
    data: { redirect_url?: string; redirect_to?: string } | null;
    error: { message: string } | null;
  }>;
}

function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) {
      throw redirect({ to: "/auth/login", search: { next } });
    }
    // A session is not enough: a password-only session of an account with a
    // second factor must not hand an app a token to act as the reader. The
    // loader below can send the reader on to an already-approved client
    // before anything renders, so `SecondFactorGate` would come too late.
    // Back here with the code in, through the challenge's `next`.
    const owed = await secondFactorGuard(supabase.auth.mfa, location);
    if (owed) throw redirect(owed);
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) {
      window.location.href = immediate;
      return data;
    }
    return data;
  },
  component: Consent,
  errorComponent: ConsentError,
});

/** The page: one feature card, centred on the flat page, under the wordmark. */
function ConsentFrame({ children }: { children: ReactNode }) {
  return (
    <main
      className={cn("grid min-h-dvh place-items-center py-10", ui.surface.page, ui.space.gutter)}
    >
      <UiCard
        as="section"
        padding="lg"
        className={cn("w-full max-w-[var(--ui-column-max)]", ui.radius.sheet)}
      >
        <Logo size="sm" />
        {children}
      </UiCard>
    </main>
  );
}

function ConsentError({ error }: { error: unknown }) {
  const { t } = useI18n();
  return (
    <ConsentFrame>
      <h1 className={cn("mt-5 text-balance", ui.display.section, ui.tone.default)}>
        {t("auth.consent.error_title")}
      </h1>
      {/* The server's own message: it names the failure, and there is no
          translated copy for every case it can report. Isolated, so an
          English sentence keeps its full stop at its own end in Arabic. */}
      <UiAlert tone="negative" className="mt-4">
        <bdi>{(error as Error)?.message ?? String(error)}</bdi>
      </UiAlert>
    </ConsentFrame>
  );
}

function Consent() {
  const { t } = useI18n();
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError(t("auth.consent.no_redirect"));
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? t("auth.consent.unknown_client");
  const scopes = details?.scopes ?? [];

  return (
    <ConsentFrame>
      <h1 className={cn("mt-5 text-balance", ui.display.section, ui.tone.default)}>
        {t("auth.consent.title").replace("{client}", clientName)}
      </h1>
      <p
        className={cn(
          "mt-2 text-pretty",
          ui.text.secondary,
          "[font-weight:var(--ui-weight-body)]",
          ui.tone.muted,
        )}
      >
        {t("auth.consent.body").replace("{client}", clientName)}
      </p>

      {scopes.length > 0 ? (
        <section
          aria-labelledby="consent-scopes"
          className={cn("mt-5 p-4", ui.radius.card, ui.surface.sunken)}
        >
          <h2 id="consent-scopes" className={cn(ui.text.label, ui.tone.muted)}>
            {t("auth.consent.scopes")}
          </h2>
          <ul className="mt-2 grid gap-1.5">
            {scopes.map((scope: string) => (
              <li
                key={scope}
                className={cn(
                  "flex items-center gap-2",
                  ui.text.meta,
                  "[font-weight:var(--ui-weight-heavy)]",
                )}
              >
                <Check className={cn("h-4 w-4 shrink-0", ui.tone.positive)} aria-hidden />
                <bdi dir="ltr">{scope}</bdi>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Either the server's message or ours; isolated for the same reason. */}
      {error ? (
        <UiAlert tone="negative" className="mt-4">
          <bdi>{error}</bdi>
        </UiAlert>
      ) : null}

      <div className="mt-6 grid gap-2.5">
        <UiButton disabled={busy} onClick={() => decide(true)}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {t("auth.consent.approve")}
        </UiButton>
        <UiButton
          variant="outline"
          disabled={busy}
          onClick={() => decide(false)}
          className={authOutlineClass}
        >
          {t("auth.consent.deny")}
        </UiButton>
      </div>
    </ConsentFrame>
  );
}
