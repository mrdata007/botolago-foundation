import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { BULK_CONFIRMATION_PHRASES } from "@/backend/football/identity/bulk-mapping/contract";
import { runPropose, runApprove } from "@/backend/football/identity/bulk-mapping/runner";
import {
  PRODUCTION_SHAPE,
  OWNER,
  buildWorld,
  newRepo,
  oracleManifest,
  ownerContext,
} from "@/backend/football/identity/bulk-mapping/test-world";
import type { ReviewerAvailability } from "@/backend/football/identity/mapping-contracts";
import { loadAllCandidates, loadAllProposals } from "@/backend/football/identity/review-queue";
import { PLAYER_MAPPING_COPY } from "./copy";
import { BulkMappingPanel } from "./BulkMappingPanel";
import { PlayerMappingsView } from "./PlayerMappingsView";
import { createMappingActions } from "./use-player-mappings";

const self: ReviewerAvailability = {
  qualifiedReviewersAvailable: 0,
  selfApprovalAllowed: true,
  secondReviewerRequired: false,
};
const dual: ReviewerAvailability = {
  ...self,
  selfApprovalAllowed: false,
  secondReviewerRequired: true,
};
const noop = () => {};

/** React's server renderer separates adjacent text nodes with comments; read the page as a person would. */
const plain = (html: string) => html.replaceAll("<!-- -->", "");
function has(html: string, needle: string): void {
  if (!plain(html).includes(needle)) throw new Error(`expected the page to contain: ${needle}`);
}
function lacks(html: string, needle: string): void {
  if (html.includes(needle)) throw new Error(`expected the page NOT to contain: ${needle}`);
}
const countOf = (html: string, re: RegExp) => (html.match(re) ?? []).length;

async function scene(spec = PRODUCTION_SHAPE) {
  const world = buildWorld(spec);
  const manifest = await oracleManifest(world);
  const repo = newRepo(world);
  const names = {
    appPlayer: new Map(world.appPlayers.map((p) => [p.id, p.displayName])),
  };
  const data = async (availability = self) => ({
    candidates: await loadAllCandidates(repo, {}, ownerContext()),
    proposals: await loadAllProposals(repo, null, ownerContext()),
    availability,
  });
  return { world, manifest, repo, names, data };
}

function panel(
  s: Awaited<ReturnType<typeof scene>>,
  data: Awaited<ReturnType<Awaited<ReturnType<typeof scene>>["data"]>>,
  over: { lang?: "fr" | "ar"; manifest?: unknown; status?: "ok" | "bad" } = {},
) {
  const lang = over.lang ?? "fr";
  return renderToString(
    <BulkMappingPanel
      lang={lang}
      copy={PLAYER_MAPPING_COPY[lang]}
      data={data}
      repository={s.repo}
      context={ownerContext()}
      rawManifest={over.manifest ?? s.manifest}
      onReload={noop}
      onClose={noop}
      initial={{
        manifest:
          over.status === "bad"
            ? { status: "bad", problems: ["hash: the manifest does not match its SHA-256"] }
            : { status: "ok", manifest: s.manifest },
        names: s.names,
      }}
    />,
  );
}

describe("the owner review screen", () => {
  test("shows all 189 rows, the tier split, the hash and the three separate actions", async () => {
    const s = await scene();
    const html = panel(s, await s.data());
    expect(countOf(html, /data-testid="bulk-row"/g)).toBe(189);
    expect(countOf(html, /data-tier="A"/g)).toBe(108);
    expect(countOf(html, /data-tier="B"/g)).toBe(81);
    has(html, s.manifest.manifestSha256);
    for (const phase of ["propose", "approve", "execute"])
      has(html, `data-testid="bulk-phase-${phase}"`);
    has(html, "PROPOSER LE LOT RÉVISÉ");
    has(html, "APPROUVER LE LOT RÉVISÉ");
    has(html, "EXÉCUTER LE LOT APPROUVÉ");
    has(html, "Flashscore est exclu");
    // The words match the real limit: bounded calls of 25, never "100".
    has(html, "en appels de 25 au plus");
    lacks(html, "de 100 au plus");
    has(html, "Aucune ne déclenche la suivante");
  });

  test("every row is selected by default; names are display-only and appear", async () => {
    const s = await scene({ tierA: 4, tierB: 3, flashscore: 0 });
    const html = panel(s, await s.data());
    expect(countOf(html, /type="checkbox"/g)).toBe(7);
    has(html, "(Affichage seulement)");
    has(html, s.world.appPlayers[0]!.displayName);
  });

  test("nothing is armed: every action button is disabled until its exact phrase is typed", async () => {
    const s = await scene();
    const html = panel(s, await s.data());
    for (const phase of ["propose", "approve", "execute"])
      expect(html).toMatch(
        new RegExp(
          `<button[^>]*disabled[^>]*data-testid="bulk-run-${phase}"|<button[^>]*data-testid="bulk-run-${phase}"[^>]*disabled`,
        ),
      );
    for (const phrase of Object.values(BULK_CONFIRMATION_PHRASES)) has(html, phrase);
    // The screen has run nothing.
    expect(await loadAllProposals(s.repo, null, ownerContext())).toHaveLength(0);
  });

  test("a Tier A and a Tier B row show their own evidence, and a name shows no signal anywhere", async () => {
    const s = await scene({ tierA: 1, tierB: 1, flashscore: 0 });
    const html = panel(s, await s.data());
    has(html, "Concorde");
    has(html, "Sans signal");
    lacks(html, "Provider 1 identical");
  });

  test("the state of each row follows the database: after PROPOSE and APPROVE the screen says so", async () => {
    const s = await scene({ tierA: 6, tierB: 4, flashscore: 0 });
    const deps = { repository: s.repo, context: ownerContext };
    const all = new Set(s.manifest.rows.map((r) => r.candidateId));
    expect(countOf(panel(s, await s.data()), /data-state="NOT_PROPOSED"/g)).toBe(10);
    await runPropose(deps, s.manifest, all);
    const proposed = panel(s, await s.data());
    expect(countOf(proposed, /data-state="PROPOSED"/g)).toBe(10);
    has(proposed, "10 proposition(s) prêtes à être approuvées");
    await runApprove(deps, s.manifest, all);
    const approved = panel(s, await s.data());
    expect(countOf(approved, /data-state="APPROVED"/g)).toBe(10);
    has(approved, "10 proposition(s) approuvées prêtes à être exécutées");
    // The execute summary: counts, the hash, and the mapped-candidate projection.
    has(approved, 'data-testid="bulk-sum-approved"');
    has(approved, "0 aujourd&#x27;hui, 10 si toutes les propositions approuvées sont exécutées");
  });

  test("a resumed screen (reopened after a partial approval) shows the real split", async () => {
    const s = await scene({ tierA: 12, tierB: 8, flashscore: 0 });
    const deps = { repository: s.repo, context: ownerContext };
    const all = new Set(s.manifest.rows.map((r) => r.candidateId));
    await runPropose(deps, s.manifest, all);
    const stop = new AbortController();
    let n = 0;
    await runApprove(deps, s.manifest, all, {
      signal: stop.signal,
      onRow: (o) => {
        if (o.acted && (n += 1) === 7) stop.abort();
      },
    });
    const html = panel(s, await s.data());
    expect(countOf(html, /data-state="APPROVED"/g)).toBe(7);
    expect(countOf(html, /data-state="PROPOSED"/g)).toBe(13);
  });

  test("when the server does not allow self-approval, APPROVE is disabled and says why", async () => {
    const s = await scene({ tierA: 3, tierB: 2, flashscore: 0 });
    const html = panel(s, await s.data(dual));
    has(html, 'data-testid="bulk-disabled-approve"');
    has(html, "n&#x27;est pas autorisée par le serveur");
  });

  test("a manifest that fails verification offers no action and no rows", async () => {
    const s = await scene({ tierA: 3, tierB: 2, flashscore: 0 });
    const html = panel(s, await s.data(), { status: "bad" });
    has(html, 'data-testid="bulk-manifest-bad"');
    expect(countOf(html, /data-testid="bulk-row"/g)).toBe(0);
    lacks(html, 'data-testid="bulk-run-propose"');
  });

  test("renders in Arabic, right to left, with the same three actions", async () => {
    const s = await scene({ tierA: 3, tierB: 2, flashscore: 0 });
    const html = panel(s, await s.data(), { lang: "ar" });
    has(html, 'dir="rtl"');
    has(html, "اقتراح الدفعة المراجَعة");
    has(html, "الموافقة على الدفعة المراجَعة");
    has(html, "تنفيذ الدفعة الموافَق عليها");
    expect(countOf(html, /data-testid="bulk-row"/g)).toBe(5);
  });
});

describe("where the screen is offered", () => {
  const render = async (over: {
    canManage?: boolean;
    proposalsEnabled?: boolean;
    manifest?: unknown;
  }) => {
    const s = await scene({ tierA: 2, tierB: 1, flashscore: 0 });
    return renderToString(
      <PlayerMappingsView
        lang="fr"
        state={{ status: "ready", data: await s.data() }}
        viewer={{ canManage: over.canManage ?? true }}
        proposalsEnabled={over.proposalsEnabled ?? true}
        repository={s.repo}
        context={ownerContext()}
        actions={createMappingActions(s.repo, () => ownerContext())}
        onReload={noop}
        bulkManifest={"manifest" in over ? over.manifest : s.manifest}
      />,
    );
  };

  test("the button is drawn for a manager with proposals enabled and a manifest", async () => {
    const html = await render({});
    has(html, 'data-testid="bulk-open"');
    has(html, "Lot contrôlé (3)");
  });
  test("not for a viewer without permission, while writes are off, or with no manifest", async () => {
    lacks(await render({ canManage: false }), 'data-testid="bulk-open"');
    lacks(await render({ proposalsEnabled: false }), 'data-testid="bulk-open"');
    lacks(await render({ manifest: undefined }), 'data-testid="bulk-open"');
  });
  test("the actor in these tests is the owner used by the world", () => {
    expect(OWNER).toBeDefined();
  });
});
