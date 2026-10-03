import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { BULK_CONFIRMATION_PHRASES } from "@/backend/football/identity/bulk-mapping/contract";
import {
  verifyFlashscoreManifest,
  type FlashscoreManifest,
} from "@/backend/football/identity/bulk-mapping/flashscore-manifest";
import { flashscoreProfile } from "@/backend/football/identity/bulk-mapping/flashscore-profile";
import { proposeCallCount } from "@/backend/football/identity/bulk-mapping/runner";
import {
  PRODUCTION_SHAPE,
  buildWorld,
  newRepo,
  ownerContext,
} from "@/backend/football/identity/bulk-mapping/test-world";
import type { ReviewerAvailability } from "@/backend/football/identity/mapping-contracts";
import { loadAllCandidates, loadAllProposals } from "@/backend/football/identity/review-queue";
import { BulkMappingPanel } from "./BulkMappingPanel";
import { getBulkCopy } from "./bulk-copy";
import { PLAYER_MAPPING_COPY } from "./copy";
import { FLASHSCORE_BULK_MANIFEST } from "./flashscore-manifest";
import { PlayerMappingsView } from "./PlayerMappingsView";
import { createMappingActions, type QueueData } from "./use-player-mappings";

const self: ReviewerAvailability = {
  qualifiedReviewersAvailable: 0,
  selfApprovalAllowed: true,
  secondReviewerRequired: false,
};
const noop = () => {};

/** React's server renderer separates adjacent text nodes with comments; read the page as a person would. */
const plain = (html: string) => html.replaceAll("<!-- -->", "").replaceAll("&#x27;", "'");
function has(html: string, needle: string): void {
  if (!plain(html).includes(needle)) throw new Error(`expected the page to contain: ${needle}`);
}
function lacks(html: string, needle: string): void {
  if (plain(html).includes(needle)) throw new Error(`expected the page NOT to contain: ${needle}`);
}
const countOf = (html: string, re: RegExp) => (html.match(re) ?? []).length;

async function verified(raw: unknown = FLASHSCORE_BULK_MANIFEST) {
  const verdict = await verifyFlashscoreManifest(raw);
  if (!verdict.ok) throw new Error(`the committed manifest must verify: ${verdict.problems[0]}`);
  return verdict.manifest;
}

const emptyData: QueueData = { candidates: [], proposals: [], availability: self };

function panel(
  manifest: FlashscoreManifest,
  over: { lang?: "fr" | "ar"; status?: "ok" | "bad"; problems?: readonly string[] } = {},
) {
  const lang = over.lang ?? "fr";
  return renderToString(
    <BulkMappingPanel
      kind="flashscore"
      lang={lang}
      copy={PLAYER_MAPPING_COPY[lang]}
      data={null}
      repository={null}
      context={ownerContext()}
      rawManifest={FLASHSCORE_BULK_MANIFEST}
      onReload={noop}
      onClose={noop}
      initial={{
        manifest:
          over.status === "bad"
            ? { status: "bad", problems: over.problems ?? ["hash"] }
            : { status: "ok", manifest },
        names: { appPlayer: new Map() },
      }}
    />,
  );
}

describe("the Flashscore batch screen", () => {
  test("the committed manifest verifies and is 24 F1 + 18 F2 with 11 held back", async () => {
    const m = await verified();
    expect(m.population).toMatchObject({ total: 42, f1: 24, f2: 18, heldBack: 11 });
  });

  test("shows the verified message, the hash, the population and the held-back notice", async () => {
    const m = await verified();
    const html = panel(m);
    const f = getBulkCopy("fr").flashscore;
    has(html, m.manifestSha256);
    has(html, f.manifestOk);
    has(html, f.title);
    has(html, f.population(m.population.total, m.population.f1, m.population.f2, 11));
    has(html, 'data-testid="bulk-held-back"');
    has(html, f.heldBack.heading(m.population.heldBack, m.population.reviewSet));
    expect(countOf(html, /data-testid="bulk-held-back-row"/g)).toBe(m.heldBack.length);
    for (const held of m.heldBack) {
      has(html, held.externalId);
      for (const code of held.codes) has(html, code);
    }
    // The Sofascore-only wording is absent.
    lacks(html, "Flashscore est exclu");
    expect(html).not.toContain('data-testid="bulk-flashscore"');
  });

  test("renders every row with its Flashscore id, its supporting Sofascore id and its class", async () => {
    const m = await verified();
    const html = panel(m);
    const f = getBulkCopy("fr").flashscore;
    expect(countOf(html, /data-testid="bulk-row"/g)).toBe(42);
    expect(countOf(html, /type="checkbox"/g)).toBe(42);
    expect(countOf(html, /data-class="F1_REVIEWED_SOFASCORE_EVENTS"/g)).toBe(24);
    expect(countOf(html, /data-class="F2_REVIEWED_SOFASCORE_SHIRT_DOB"/g)).toBe(18);
    for (const row of m.rows) {
      has(html, `>${row.externalId}<`);
      has(html, `>${row.supporting.externalId}<`);
      has(html, row.appPlayerId);
    }
    has(html, f.classShort.F1_REVIEWED_SOFASCORE_EVENTS);
    has(html, f.classShort.F2_REVIEWED_SOFASCORE_SHIRT_DOB);
    has(html, f.table.supportingId);
    has(html, f.evidence.birthDateAgrees);
    has(html, f.evidence.events(m.rows[0]!.evidence.alignedEventCount));
    has(html, "(Affichage seulement)");
    // Names are display-only: nothing here has loaded one.
    expect(countOf(html, /data-state="NOT_PROPOSED"/g)).toBe(42);
  });

  test("the propose text states the call count derived from the selection", async () => {
    const m = await verified();
    const html = panel(m);
    const f = getBulkCopy("fr").flashscore;
    const expected = proposeCallCount(flashscoreProfile, m.rows);
    // 24 F1 -> 1 call, 18 F2 -> 1 call, with 25 rows per call.
    expect(expected).toBe(2);
    has(html, 'data-testid="bulk-propose-calls"');
    has(html, f.proposeCalls(expected));
    expect(plain(html).match(/La sélection actuelle demande (\d+) appel/)?.[1]).toBe(
      String(expected),
    );
  });

  test("keeps the three separate phases and the unchanged typed phrases, all disabled", async () => {
    const html = panel(await verified());
    for (const phase of ["propose", "approve", "execute"]) {
      has(html, `data-testid="bulk-phase-${phase}"`);
      expect(html).toMatch(
        new RegExp(
          `<button[^>]*disabled[^>]*data-testid="bulk-run-${phase}"|<button[^>]*data-testid="bulk-run-${phase}"[^>]*disabled`,
        ),
      );
    }
    for (const phrase of Object.values(BULK_CONFIRMATION_PHRASES)) has(html, phrase);
    has(html, "PROPOSER LE LOT RÉVISÉ");
    has(html, "APPROUVER LE LOT RÉVISÉ");
    has(html, "EXÉCUTER LE LOT APPROUVÉ");
    has(html, "Aucune ne déclenche la suivante");
  });

  test("never uses the Sofascore batch's vocabulary, in either language", async () => {
    const m = await verified();
    for (const lang of ["fr", "ar"] as const) {
      const html = plain(panel(m, { lang }));
      for (const word of ["Tier", "tier", "SportsMonks", "niveau", "canonical", "Niveau"]) {
        if (html.includes(word)) throw new Error(`${lang}: found "${word}" in the Flashscore page`);
      }
    }
  });

  test("renders in Arabic, right to left, with the same rows", async () => {
    const html = panel(await verified(), { lang: "ar" });
    has(html, 'dir="rtl"');
    has(html, getBulkCopy("ar").flashscore.title);
    expect(countOf(html, /data-testid="bulk-row"/g)).toBe(42);
    for (const phase of ["propose", "approve", "execute"])
      has(html, `data-testid="bulk-phase-${phase}"`);
  });

  test("a tampered manifest is refused: no rows, no held-back list, no phase control", async () => {
    const raw = structuredClone(FLASHSCORE_BULK_MANIFEST) as FlashscoreManifest;
    // One character of one proposal fingerprint.
    const first = raw.rows[0]!;
    const flipped = first.expectedFingerprint.startsWith("0") ? "1" : "0";
    const tampered = {
      ...raw,
      rows: [
        { ...first, expectedFingerprint: flipped + first.expectedFingerprint.slice(1) },
      ].concat(raw.rows.slice(1)),
    };
    const verdict = await verifyFlashscoreManifest(tampered);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    const html = panel(raw, { status: "bad", problems: verdict.problems });
    has(html, 'data-testid="bulk-manifest-bad"');
    has(html, "Manifeste refusé");
    expect(countOf(html, /data-testid="bulk-row"/g)).toBe(0);
    for (const phase of ["propose", "approve", "execute"]) {
      lacks(html, `data-testid="bulk-run-${phase}"`);
      lacks(html, `data-testid="bulk-phase-${phase}"`);
    }
    lacks(html, 'data-testid="bulk-held-back"');
  });

  test("a changed hash is refused too", async () => {
    const raw = structuredClone(FLASHSCORE_BULK_MANIFEST) as FlashscoreManifest;
    const swapped = (raw.manifestSha256.startsWith("a") ? "b" : "a") + raw.manifestSha256.slice(1);
    const verdict = await verifyFlashscoreManifest({ ...raw, manifestSha256: swapped });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.problems.join(" ")).toContain("hash");
  });

  test("the French and Arabic Flashscore copy have the same shape", () => {
    const shape = (value: unknown): unknown =>
      typeof value === "function"
        ? "fn"
        : Array.isArray(value)
          ? value.map(shape)
          : value && typeof value === "object"
            ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]))
            : typeof value;
    expect(shape(getBulkCopy("ar").flashscore)).toEqual(shape(getBulkCopy("fr").flashscore));
    expect(getBulkCopy("ar").flashscore.title).not.toBe(getBulkCopy("fr").flashscore.title);
  });
});

describe("where the Flashscore batch is offered", () => {
  const render = async (over: {
    canManage?: boolean;
    proposalsEnabled?: boolean;
    flashscoreManifest?: unknown;
    sofascoreOpen?: boolean;
    flashscoreOpen?: boolean;
  }) => {
    const world = buildWorld({ ...PRODUCTION_SHAPE, tierA: 2, tierB: 1, flashscore: 0 });
    const repo = newRepo(world);
    const data: QueueData = {
      candidates: await loadAllCandidates(repo, {}, ownerContext()),
      proposals: await loadAllProposals(repo, null, ownerContext()),
      availability: self,
    };
    const manifest = await verified();
    return renderToString(
      <PlayerMappingsView
        lang="fr"
        state={{ status: "ready", data }}
        viewer={{ canManage: over.canManage ?? true }}
        proposalsEnabled={over.proposalsEnabled ?? true}
        repository={repo}
        context={ownerContext()}
        actions={createMappingActions(repo, () => ownerContext())}
        onReload={noop}
        bulkManifest={{ rows: [1, 2, 3] }}
        flashscoreManifest={
          "flashscoreManifest" in over ? over.flashscoreManifest : FLASHSCORE_BULK_MANIFEST
        }
        initial={{
          bulk: over.sofascoreOpen ?? false,
          flashscoreBulk: over.flashscoreOpen ?? false,
          bulkPanel: { manifest: { status: "ok", manifest }, names: { appPlayer: new Map() } },
        }}
      />,
    );
  };

  test("a second entry is drawn beside the Sofascore one", async () => {
    const html = await render({});
    has(html, 'data-testid="bulk-open"');
    has(html, 'data-testid="bulk-open-flashscore"');
    has(html, "Lot Flashscore (42)");
  });

  test("not for a viewer without permission, while writes are off, or with no manifest", async () => {
    lacks(await render({ canManage: false }), 'data-testid="bulk-open-flashscore"');
    lacks(await render({ proposalsEnabled: false }), 'data-testid="bulk-open-flashscore"');
    lacks(await render({ flashscoreManifest: null }), 'data-testid="bulk-open-flashscore"');
  });

  test("not while the Sofascore batch panel is open", async () => {
    const html = await render({ sofascoreOpen: true });
    lacks(html, 'data-testid="bulk-open-flashscore"');
    has(html, 'data-testid="bulk-panel"');
  });

  test("opening it shows the Flashscore panel, not the Sofascore one", async () => {
    const html = await render({ flashscoreOpen: true });
    has(html, getBulkCopy("fr").flashscore.title);
    has(html, 'data-testid="bulk-held-back"');
    lacks(html, 'data-testid="bulk-open-flashscore"');
  });
});
