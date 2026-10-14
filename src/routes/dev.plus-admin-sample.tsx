import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import type { PremiumAdminRepository } from "@/backend/premium/admin";
import { PlusAdminScreen } from "@/components/admin/plus/PlusAdminScreen";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * A SAMPLE of the BotolaGO+ admin screen, for browser tests and for looking at it. Development
 * servers only: anywhere else this route is "not found", so it is never a page a visitor or a
 * crawler can reach, and the sample data module is loaded by a dynamic import that a production
 * build removes together with the `import.meta.env.DEV` branch.
 *
 * Everything on it is invented and lives in memory. No database, no network, no Supabase client.
 * Try the id 5a000000-0000-4000-8000-000000000001 or the e-mail karim@example.test (an active
 * member), ...0002 (a staff comp) and ...0003 (nobody).
 */
type Search = {
  lang?: "fr" | "ar";
  /** `1`: a reader without premium.grant (no grant or revoke controls). */
  reader?: "1";
  /** `error`: the overview fails. `refuse`: every grant and revoke is refused (recent sign-in). */
  state?: "error" | "refuse" | "old";
};

export const Route = createFileRoute("/dev/plus-admin-sample")({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(search.lang === "ar" || search.lang === "fr" ? { lang: search.lang } : {}),
    ...(String(search.reader) === "1" ? { reader: "1" as const } : {}),
    ...(search.state === "error" || search.state === "refuse" || search.state === "old"
      ? { state: search.state }
      : {}),
  }),
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: SampleHarness,
});

function SampleHarness() {
  const search = Route.useSearch();
  const lang = search.lang ?? "fr";
  const [repository, setRepository] = useState<PremiumAdminRepository | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let cancelled = false;
    void import("@/backend/premium/admin-sample").then(({ InMemoryPremiumAdminRepository }) => {
      if (cancelled) return;
      setRepository(
        new InMemoryPremiumAdminRepository({
          ...(search.state === "error" ? { failOverviewWith: "premium_admin_unavailable" } : {}),
          ...(search.state === "refuse" ? { failWriteWith: "recent_auth_required" } : {}),
          ...(search.state === "old" ? { withoutByProduct: true } : {}),
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [search.state]);

  return (
    <div className={cn("min-h-dvh", ui.surface.page)} dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="mx-auto w-full max-w-4xl px-4 py-4">
        <p className={cn("mb-4", ui.text.meta)} data-testid="sample-harness">
          SAMPLE DATA · not production
        </p>
        <div data-testid="plus-admin-sample">
          {repository && (
            <PlusAdminScreen
              repository={repository}
              canGrant={search.reader !== "1"}
              canLookupEmail={search.reader !== "1"}
              lang={lang}
              makeContext={() => ({
                actorId: "5a000000-0000-4000-8000-0000000000aa",
                requestId: crypto.randomUUID(),
              })}
            />
          )}
        </div>
      </div>
    </div>
  );
}
