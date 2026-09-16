import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { IS_DEMO_MODE } from "@/config/app-mode";
import { useI18n } from "@/i18n/provider";
import { OAUTH_CONSENT_COPY } from "@/lib/oauth-consent-copy";

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
    if (IS_DEMO_MODE) throw redirect({ to: "/" });
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) {
      throw redirect({ to: "/auth/login", search: { next } });
    }
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

function ConsentError() {
  const { lang, dir } = useI18n();
  const copy = OAUTH_CONSENT_COPY[lang];
  return (
    <main dir={dir} className="mx-auto max-w-md p-6" data-testid="oauth-consent-error">
      <h1 className="text-lg font-semibold">{copy.errorTitle}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{copy.errorBody}</p>
    </main>
  );
}

function Consent() {
  const { lang, dir } = useI18n();
  const copy = OAUTH_CONSENT_COPY[lang];
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
      setError(copy.errorBody);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError(copy.noRedirect);
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? copy.clientFallback;

  return (
    <main
      dir={dir}
      className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6"
      data-testid="oauth-consent"
    >
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{copy.title(clientName)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{copy.description(clientName)}</p>
      </div>

      {details?.scopes && details.scopes.length > 0 && (
        <section className="rounded-xl border border-input bg-background/50 p-4 text-sm">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-foreground">
            {copy.scopes}
          </h2>
          <ul>
            {details.scopes.map((s: string) => (
              <li key={s} className="text-muted-foreground">
                • {s}
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
        >
          {error}
        </p>
      )}

      <div className="grid gap-2">
        <button
          disabled={busy}
          onClick={() => decide(true)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl cta-brand px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {copy.approve}
        </button>
        <button
          disabled={busy}
          onClick={() => decide(false)}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-input bg-background px-4 py-2 text-sm font-semibold hover:bg-accent disabled:opacity-60"
        >
          {copy.deny}
        </button>
      </div>
    </main>
  );
}
