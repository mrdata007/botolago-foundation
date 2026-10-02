import { createFileRoute, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { InMemoryPlayerMappingRepository } from "@/backend/football/identity/mock-mapping-repository";
import { SAMPLE_ACTORS, buildSampleWorld } from "@/backend/football/identity/sample-mapping-data";
import { PlayerMappingsScreen } from "@/components/admin/player-mappings/PlayerMappingsScreen";
import { ui, UiButton } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * A SAMPLE of the player-mapping reviewer screen, for browser tests and for
 * looking at it. Development servers only: anywhere else this route is "not
 * found", so it is never a page a visitor or a crawler can reach.
 *
 * Everything on it is invented (names such as "Joueur Exemple 0042") and lives
 * in memory for the life of the page. No database, no network, no Supabase
 * client: the screen is given an in-memory repository, so the two-person rules
 * can be walked through end to end without a real proposal ever existing.
 */
type Search = {
  lang?: "fr" | "ar";
  /** `1`: only one qualified reviewer exists (the second-reviewer-required state). */
  reviewers?: "1";
  /** `1`: single-approver mode, a proposer may approve their own proposal. */
  selfapprove?: "1";
  /** `small`: a few dozen candidates, for a fast browser test. */
  scale?: "small";
  /** `1`: the proposal switch is on, so the write controls are drawn. */
  writes?: "1";
};

export const Route = createFileRoute("/dev/player-mappings-sample")({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(search.lang === "ar" || search.lang === "fr" ? { lang: search.lang } : {}),
    // The router parses `1` into a number before it gets here.
    ...(String(search.reviewers) === "1" ? { reviewers: "1" as const } : {}),
    ...(String(search.selfapprove) === "1" ? { selfapprove: "1" as const } : {}),
    ...(search.scale === "small" ? { scale: "small" as const } : {}),
    ...(String(search.writes) === "1" ? { writes: "1" as const } : {}),
  }),
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: SampleHarness,
});

type Seat = "proposer" | "approver" | "reader";

function SampleHarness() {
  const search = Route.useSearch();
  const lang = search.lang ?? "fr";
  const [seat, setSeat] = useState<Seat>("proposer");
  const repository = useMemo(() => {
    const world = buildSampleWorld(
      search.scale === "small" ? { sofascore: 36, flashscore: 28 } : {},
    );
    return new InMemoryPlayerMappingRepository({
      candidates: world.candidates,
      appPlayers: world.appPlayers,
      allowSelfApproval: search.selfapprove === "1",
      qualifiedActors:
        search.reviewers === "1"
          ? [SAMPLE_ACTORS.proposer]
          : [SAMPLE_ACTORS.proposer, SAMPLE_ACTORS.approver],
    });
  }, [search.scale, search.reviewers, search.selfapprove]);

  const actorId = seat === "approver" ? SAMPLE_ACTORS.approver : SAMPLE_ACTORS.proposer;
  return (
    <div className={cn("min-h-dvh", ui.surface.page)} dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="mx-auto w-full max-w-4xl px-4 py-4">
        <div
          role="group"
          aria-label="Sample seat"
          className="mb-4 flex flex-wrap items-center gap-2"
          data-testid="sample-harness"
        >
          <span className={ui.text.meta}>SAMPLE DATA · not production</span>
          {(["proposer", "approver", "reader"] as const).map((value) => (
            <UiButton
              key={value}
              size="sm"
              variant={seat === value ? "ink" : "outline"}
              aria-pressed={seat === value}
              onClick={() => setSeat(value)}
              data-testid={`sample-seat-${value}`}
            >
              {value}
            </UiButton>
          ))}
        </div>
        <PlayerMappingsScreen
          key={seat}
          repository={repository}
          actorId={actorId}
          canManage={seat !== "reader"}
          lang={lang}
          proposalsEnabled={search.writes === "1"}
        />
      </div>
    </div>
  );
}
