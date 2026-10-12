import { createFileRoute, notFound } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  InMemorySofascorePlayerQueueRepository,
  buildSampleSofascoreQueue,
} from "@/backend/football/identity/sofascore-player-queue-sample";
import { SofascorePlayerQueueScreen } from "@/components/admin/sofascore-player-queue/SofascorePlayerQueueScreen";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * A SAMPLE of the "SofaScore players to confirm" screen, for browser tests and
 * for looking at it. Development servers only: anywhere else this route is "not
 * found", so it is never a page a visitor or a crawler can reach.
 *
 * Everything on it is invented and lives in memory for the life of the page. No
 * database, no network, no Supabase client.
 */
type Search = {
  lang?: "fr" | "ar";
  /** `1`: a reader without the confirm permission (no confirm buttons). */
  reader?: "1";
  /** `empty`: nothing waiting. `error`: the list fails to load. `refuse`: every confirmation is refused. */
  state?: "empty" | "error" | "refuse";
};

export const Route = createFileRoute("/dev/sofascore-players-sample")({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(search.lang === "ar" || search.lang === "fr" ? { lang: search.lang } : {}),
    ...(String(search.reader) === "1" ? { reader: "1" as const } : {}),
    ...(search.state === "empty" || search.state === "error" || search.state === "refuse"
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
  const repository = useMemo(
    () =>
      new InMemorySofascorePlayerQueueRepository({
        ...(search.state === "empty" ? { entries: { entries: [], skipped: 0 } } : {}),
        ...(search.state === "error" ? { failListWith: "queue_unavailable" as const } : {}),
        ...(search.state === "refuse"
          ? { failResolveWith: "sofascore_mapping_conflict" as const }
          : {}),
        ...(search.state === undefined ? { entries: buildSampleSofascoreQueue() } : {}),
      }),
    [search.state],
  );
  return (
    <div className={cn("min-h-dvh", ui.surface.page)} dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="mx-auto w-full max-w-4xl px-4 py-4">
        <p className={cn("mb-4", ui.text.meta)} data-testid="sample-harness">
          SAMPLE DATA · not production
        </p>
        <SofascorePlayerQueueScreen
          key={`${search.state ?? "ok"}-${search.reader ?? "0"}`}
          repository={repository}
          canManage={search.reader !== "1"}
          lang={lang}
        />
      </div>
    </div>
  );
}
