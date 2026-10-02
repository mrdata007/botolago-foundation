import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import type { RepositoryContext } from "@/backend/contracts/repository";
import { MAPPING_ERROR_CODES } from "@/backend/football/identity/mapping-contracts";
import type {
  CandidateDto,
  ProposalDto,
  ReviewerAvailability,
} from "@/backend/football/identity/mapping-contracts";
import { InMemoryPlayerMappingRepository } from "@/backend/football/identity/mock-mapping-repository";
import {
  loadAllCandidates,
  loadOptions,
  loadAllProposals,
} from "@/backend/football/identity/review-queue";
import { SAMPLE_ACTORS, buildSampleWorld } from "@/backend/football/identity/sample-mapping-data";
import { PLAYER_MAPPING_COPY } from "./copy";
import {
  PlayerMappingsView,
  ROWS_PER_PAGE,
  type PlayerMappingsViewProps,
} from "./PlayerMappingsView";
import { isConfirmationTyped } from "./execute-confirmation";
import { createMappingActions, type QueueData } from "./use-player-mappings";

const ctx = (actorId: string): RepositoryContext => ({ actorId, requestId: "ssr" });
const proposer = ctx(SAMPLE_ACTORS.proposer);
const approver = ctx(SAMPLE_ACTORS.approver);
const both: ReviewerAvailability = {
  qualifiedReviewersAvailable: 1,
  selfApprovalAllowed: false,
  secondReviewerRequired: false,
};
const lonely: ReviewerAvailability = {
  qualifiedReviewersAvailable: 0,
  selfApprovalAllowed: false,
  secondReviewerRequired: true,
};
const loneSelfApprover: ReviewerAvailability = {
  qualifiedReviewersAvailable: 0,
  selfApprovalAllowed: true,
  secondReviewerRequired: false,
};

const noop = () => {};

/** Assertions that name what is missing instead of dumping a whole page of HTML. */
function has(html: string, needle: string): void {
  if (!html.includes(needle)) throw new Error(`expected the page to contain: ${needle}`);
}
function lacks(html: string, needle: string): void {
  if (html.includes(needle)) throw new Error(`expected the page NOT to contain: ${needle}`);
}
function count(html: string, pattern: RegExp, expected: number, what: string): void {
  const found = (html.match(pattern) ?? []).length;
  if (found !== expected) throw new Error(`${what}: expected ${expected}, found ${found}`);
}

async function fixture() {
  const world = buildSampleWorld();
  const candidates = await loadAllCandidates(world.repository, {}, proposer);
  return { world, candidates };
}

function render(props: Partial<PlayerMappingsViewProps> & Pick<PlayerMappingsViewProps, "state">) {
  const repository = props.repository ?? null;
  return renderToString(
    <PlayerMappingsView
      lang="fr"
      viewer={{ canManage: true }}
      proposalsEnabled={false}
      repository={repository}
      context={proposer}
      actions={repository ? createMappingActions(repository, () => proposer) : (undefined as never)}
      onReload={noop}
      {...props}
    />,
  );
}

const ready = (
  data: Partial<QueueData> & Pick<QueueData, "candidates">,
): PlayerMappingsViewProps["state"] => ({
  status: "ready",
  data: { proposals: [], availability: both, ...data },
});

describe("states", () => {
  test("loading says so, with progress, in a live region", () => {
    const html = render({ state: { status: "loading", loaded: 0 } });
    has(html, 'data-testid="mapping-loading"');
    has(html, 'role="status"');
    has(html, "Chargement des candidats…");
    has(render({ state: { status: "loading", loaded: 600 } }), "600 reçus");
  });

  test("an error is an alert with a way to retry, and the refusal in words", () => {
    const html = render({ state: { status: "error", code: "mapping_unavailable" } });
    has(html, 'data-testid="mapping-error"');
    has(html, 'role="alert"');
    has(html, "mapping_unavailable");
    has(html, "Le service de rapprochement est indisponible.");
    has(html, 'data-testid="mapping-retry"');
    expect(render({ state: { status: "error", code: "permission_missing" } })).toContain(
      "Votre rôle n’a pas cette permission.",
    );
  });

  test("an empty database is said plainly, not drawn as an empty table", () => {
    const html = render({ state: ready({ candidates: [] }) });
    has(html, 'data-testid="mapping-empty"');
    has(html, "Aucun candidat enregistré pour le moment.");
    lacks(html, 'data-testid="mapping-rows"');
  });

  test("a view with nothing in it has its own empty sentence", async () => {
    const { candidates } = await fixture();
    const html = render({ state: ready({ candidates }), initial: { view: "mapped" } });
    has(html, 'data-testid="mapping-empty-view"');
    has(html, "Aucun candidat n’est rapproché.");
  });
});

describe("the queue at production scale (1,004 candidates)", () => {
  test("six views with their counts, 25 rows a page, 41 pages, every row a real button", async () => {
    const { candidates } = await fixture();
    const html = render({ state: ready({ candidates }) });
    has(html, "Non rapprochés");
    has(html, "(1004)");
    for (const view of ["unmapped", "proposed", "waiting_second", "mapped", "ignored", "held"])
      has(html, `data-testid="mapping-tab-${view}"`);
    count(html, /data-testid="mapping-row"/g, ROWS_PER_PAGE, "matches");
    has(html, "Page 1 sur 41");
    has(html, "1004 sur 1004 candidats");
    // Rows are buttons: reachable by Tab and operable with Enter and Space.
    const rows = html.match(/<button[^>]*data-testid="mapping-row"/g) ?? [];
    expect(rows).toHaveLength(ROWS_PER_PAGE);
    has(html, 'data-row-index="24"');
    lacks(html, 'data-row-index="25"');
  });

  test("a row shows provider, name, club, shirt, position, evidence and flags", async () => {
    const { candidates } = await fixture();
    const html = render({ state: ready({ candidates }) });
    expect(html).toMatch(/Sofascore|Flashscore/);
    has(html, 'data-testid="mapping-row-club"');
    has(html, 'data-testid="mapping-row-evidence"');
    expect(html).toMatch(/N° \d+|N° inconnu/);
    has(html, "Options en cours de calcul…");
  });

  test("filters: club, provider, status, evidence, flag and a search that filters only", async () => {
    const { candidates } = await fixture();
    const html = render({ state: ready({ candidates }) });
    for (const id of ["club", "provider", "status", "evidence", "flag", "search"])
      has(html, `data-testid="mapping-filter-${id}"`);
    has(html, 'role="search"');
    has(html, "Filtre seulement, ne classe jamais.");
    // Sixteen clubs, each with its candidate count.
    has(html, "Widad Témara");
    has(html, "Maghreb Fès");
  });

  test("a filter narrows the rows and the count says how many", async () => {
    const { candidates } = await fixture();
    const html = render({
      state: ready({ candidates }),
      initial: { filters: { provider: "flashscore", club: "widad-temara" } },
    });
    const widadFlash = candidates.filter(
      (c) =>
        c.provider === "flashscore" && c.observations.some((o) => o.clubKey === "widad-temara"),
    ).length;
    count(html, /data-testid="mapping-row"/g, Math.min(widadFlash, ROWS_PER_PAGE), "matches");
    has(html, `${widadFlash} sur 1004 candidats`);
    has(html, "Réinitialiser les filtres");
  });

  test("multi-squad candidates show two clubs and the 'Deux effectifs' flag", async () => {
    const { candidates } = await fixture();
    const multi = candidates.filter((c) => c.flags.includes("MULTI_SQUAD_OBSERVATION"));
    expect(multi).toHaveLength(2);
    const html = render({
      state: ready({ candidates }),
      initial: { filters: { flag: "MULTI_SQUAD_OBSERVATION" } },
    });
    count(html, /data-testid="mapping-row"/g, 2, "matches");
    has(html, "(2 clubs)");
    has(html, 'data-flag="MULTI_SQUAD_OBSERVATION"');
  });

  test("incomplete squads show 'Effectif incomplet' on the row", async () => {
    const { candidates } = await fixture();
    const html = render({
      state: ready({ candidates }),
      initial: { filters: { flag: "INCOMPLETE_PROVIDER_SQUAD" } },
    });
    has(html, 'data-flag="INCOMPLETE_PROVIDER_SQUAD"');
    lacks(html, 'data-flag="MULTI_SQUAD_OBSERVATION"');
  });

  test("a row's option count and category come from the previews it is given", async () => {
    const { candidates } = await fixture();
    const first = candidates[0]!;
    const html = render({
      state: ready({ candidates }),
      initial: {
        filters: { search: first.externalId },
        previews: new Map([
          [
            first.id,
            { status: "ready", plausible: 3, preview: { category: "B", reasons: ["tied_top"] } },
          ],
        ]),
      },
    });
    has(html, "3 options plausibles");
    has(html, 'data-preview="B"');
    const failed = render({
      state: ready({ candidates }),
      initial: {
        filters: { search: first.externalId },
        previews: new Map([[first.id, { status: "failed", code: "mapping_unavailable" }]]),
      },
    });
    has(failed, "Options indisponibles");
  });
});

describe("read-only until the first proposal is approved", () => {
  test("with the proposal switch off the screen says so and draws no write control", async () => {
    const { world, candidates } = await fixture();
    const target = candidates[5]!;
    const options = await loadOptions(world.repository, target, "club", proposer);
    const html = render({
      state: ready({ candidates }),
      proposalsEnabled: false,
      repository: world.repository,
      initial: { selection: { kind: "candidate", id: target.id }, options },
    });
    has(html, 'data-testid="mapping-writes-disabled"');
    has(html, "pas encore activée");
    lacks(html, 'data-testid="mapping-option-select"');
    lacks(html, 'data-testid="mapping-propose-trigger"');
    lacks(html, 'data-testid="mapping-approve"');
  });

  test("a reader without football.manage_mappings is told, and sees no write control", async () => {
    const { world, candidates } = await fixture();
    const target = candidates[5]!;
    const options = await loadOptions(world.repository, target, "club", proposer);
    const html = render({
      state: ready({ candidates }),
      proposalsEnabled: true,
      viewer: { canManage: false },
      repository: world.repository,
      initial: { selection: { kind: "candidate", id: target.id }, options },
    });
    has(html, "football.manage_mappings requis");
    lacks(html, 'data-testid="mapping-option-select"');
    lacks(html, 'data-testid="mapping-propose-trigger"');
  });
});

describe("the comparison", () => {
  test("provider evidence, then every app player ranked, with position disagreements flagged", async () => {
    const { world, candidates } = await fixture();
    // A Sofascore candidate whose options include a position disagreement.
    let target: CandidateDto | undefined;
    let options = await loadOptions(world.repository, candidates[0]!, "club", proposer);
    for (const candidate of candidates.filter((c) => c.provider === "sofascore").slice(0, 30)) {
      options = await loadOptions(world.repository, candidate, "club", proposer);
      // One that disagrees on position within the ten shown first.
      if (
        options
          .slice(0, 10)
          .some((o) => (o.signals as { position?: string }).position === "conflict")
      ) {
        target = candidate;
        break;
      }
    }
    expect(target).toBeDefined();
    const html = render({
      state: ready({ candidates }),
      proposalsEnabled: true,
      repository: world.repository,
      initial: { selection: { kind: "candidate", id: target!.id }, options },
    });
    has(html, 'data-testid="mapping-provider-evidence"');
    has(html, "Ce que dit le fournisseur");
    has(html, target!.externalId);
    has(html, target!.displayName!);
    // All options are in the DOM list (the first ten, plus the button for the rest).
    count(html, /data-testid="mapping-option"/g, 10, "matches");
    has(html, `Voir les ${options.length - 10} autres`);
    // Every signal is words as well as colour.
    expect(html).toMatch(/Concorde|Différent|Sans signal/);
    // A position disagreement is a visible flag, never a hidden row.
    has(html, "Poste différent : à vérifier");
    has(html, "Toutes les options restent visibles");
    // The preview reads the evidence and says it is not a decision.
    has(html, 'data-testid="mapping-preview"');
    has(html, "aperçu, pas une décision");
  });

  test("widened to all players, an option from another club says so on the row", async () => {
    const { world, candidates } = await fixture();
    const target = candidates.find((c) => c.provider === "sofascore")!;
    const all = await loadOptions(world.repository, target, "all", proposer);
    const other = all.find((o) => (o.signals as { club?: string }).club === "mismatch")!;
    expect(other).toBeDefined();
    const html = render({
      state: ready({ candidates }),
      repository: world.repository,
      initial: {
        selection: { kind: "candidate", id: target.id },
        options: [other, ...all.filter((o) => o !== other)],
      },
    });
    has(html, 'data-testid="mapping-club-flag"');
    has(html, "Autre club : à vérifier");
    // The comparison reads it as a case to investigate, not a strong suggestion.
    has(html, "La meilleure option appartient à un autre club.");
  });

  test("a Flashscore candidate says the provider carries no date of birth", async () => {
    const { world, candidates } = await fixture();
    const target = candidates.find((c) => c.provider === "flashscore")!;
    const options = await loadOptions(world.repository, target, "club", proposer);
    const html = render({
      state: ready({ candidates }),
      repository: world.repository,
      initial: { selection: { kind: "candidate", id: target.id }, options },
    });
    has(html, "Non fournie par ce fournisseur");
  });

  test("an incomplete squad is explained, and no option is lowered for it", async () => {
    const { world, candidates } = await fixture();
    const target = candidates.find((c) => c.flags.includes("INCOMPLETE_PROVIDER_SQUAD"))!;
    const options = await loadOptions(world.repository, target, "club", proposer);
    const html = render({
      state: ready({ candidates }),
      repository: world.repository,
      initial: { selection: { kind: "candidate", id: target.id }, options },
    });
    has(html, 'data-testid="mapping-incomplete-note"');
    has(html, "l’absence d’un joueur ne prouve rien et ne baisse aucune option");
    has(html, "Incomplet");
    expect(options.length).toBeGreaterThanOrEqual(24);
  });

  test("a multi-squad candidate shows both clubs and both squads", async () => {
    const { world, candidates } = await fixture();
    const target = candidates.find((c) => c.flags.includes("MULTI_SQUAD_OBSERVATION"))!;
    const options = await loadOptions(world.repository, target, "club", proposer);
    const html = render({
      state: ready({ candidates }),
      repository: world.repository,
      initial: { selection: { kind: "candidate", id: target.id }, options },
    });
    has(html, "2 effectifs observés");
    has(html, 'data-flag="MULTI_SQUAD_OBSERVATION"');
    has(html, "D · Conflit, à examiner");
    has(html, "Le candidat figure dans deux effectifs.");
  });

  test("with the ranking not yet loaded the comparison shows a loading skeleton", async () => {
    const { world, candidates } = await fixture();
    const html = render({
      state: ready({ candidates }),
      repository: world.repository,
      initial: { selection: { kind: "candidate", id: candidates[1]!.id } },
    });
    has(html, 'data-testid="mapping-options-loading"');
  });
});

/** Two people have the world in common; each sees it from their own seat. */
async function proposalWorld(availability: ReviewerAvailability, allowSelfApproval = false) {
  const world = buildSampleWorld({ sofascore: 20, flashscore: 0 });
  const repo = allowSelfApproval
    ? new InMemoryPlayerMappingRepository({
        candidates: world.candidates,
        appPlayers: world.appPlayers,
        qualifiedActors: [SAMPLE_ACTORS.proposer],
        allowSelfApproval: true,
      })
    : world.repository;
  const candidate = (await loadAllCandidates(repo, {}, proposer))[0]!;
  const options = await loadOptions(repo, candidate, "club", proposer);
  const pick =
    options.find((o) => (o.signals as { position?: string }).position === "match") ?? options[0]!;
  const made = await repo.proposeMappings(
    [{ kind: "map", sofascoreCandidateId: candidate.id, appPlayerId: pick.appPlayerId }],
    "Même numéro, même poste, même club.",
    crypto.randomUUID(),
    proposer,
  );
  const id = (made.proposals[0] as { id: string }).id;
  const seenBy = async (who: RepositoryContext) => ({
    candidates: await loadAllCandidates(repo, {}, who),
    proposals: await loadAllProposals(repo, null, who),
    availability,
  });
  return { world, repo, candidate, id, seenBy, options };
}

describe("dual control, as drawn", () => {
  test("the proposer sees their pending proposal, waiting, with no approve or reject", async () => {
    const w = await proposalWorld(both);
    const data = await w.seenBy(proposer);
    const html = render({
      state: ready(data),
      proposalsEnabled: true,
      repository: w.repo,
      initial: { selection: { kind: "proposal", id: w.id } },
    });
    has(html, 'data-testid="mapping-proposal"');
    has(html, 'data-testid="mapping-own-proposal"');
    has(html, "Vous avez proposé ceci");
    has(html, "Une autre personne doit l’approuver ou la rejeter");
    lacks(html, 'data-testid="mapping-approve"');
    lacks(html, 'data-testid="mapping-reject"');
    // They may withdraw it.
    has(html, 'data-testid="mapping-cancel"');
    // The exact fingerprint is on screen.
    const proposal = data.proposals[0]!;
    has(html, proposal.fingerprint);
    lacks(html, 'data-testid="mapping-execution-separate"');
  });

  test("a different qualified person sees approve and reject, and the exact fingerprint", async () => {
    const w = await proposalWorld(both);
    const data = await w.seenBy(approver);
    const proposal = data.proposals[0]!;
    expect(proposal.canApprove).toBe(true);
    const html = render({
      state: ready(data),
      proposalsEnabled: true,
      viewer: { canManage: true },
      repository: w.repo,
      context: approver,
      initial: { selection: { kind: "proposal", id: w.id } },
    });
    has(html, 'data-testid="mapping-approve"');
    has(html, 'data-testid="mapping-reject"');
    has(html, proposal.fingerprint);
    lacks(html, 'data-testid="mapping-cancel"');
    lacks(html, 'data-testid="second-reviewer-required"');
  });

  test("with one qualified reviewer: SECOND RELECTEUR QUALIFIÉ REQUIS and no way round it", async () => {
    const w = await proposalWorld(lonely);
    const data = await w.seenBy(proposer);
    const html = render({
      state: ready(data),
      proposalsEnabled: true,
      repository: w.repo,
      initial: { selection: { kind: "proposal", id: w.id } },
    });
    has(html, 'data-testid="second-reviewer-required"');
    has(html, "SECOND RELECTEUR QUALIFIÉ REQUIS");
    has(html, "il n’y a pas de contournement".replace("il", "Il"));
    lacks(html, 'data-testid="mapping-approve"');
    lacks(html, 'data-testid="mapping-reject"');
    const ar = render({
      lang: "ar",
      state: ready(data),
      proposalsEnabled: true,
      repository: w.repo,
      initial: { selection: { kind: "proposal", id: w.id } },
    });
    has(ar, "مطلوب مراجع ثانٍ مؤهَّل");
  });

  test("single-approver mode: the lone proposer sees a warning and approve/reject, not the second-reviewer wall", async () => {
    const w = await proposalWorld(loneSelfApprover, true);
    const data = await w.seenBy(proposer);
    const html = render({
      state: ready(data),
      proposalsEnabled: true,
      repository: w.repo,
      initial: { selection: { kind: "proposal", id: w.id } },
    });
    has(html, 'data-testid="mapping-self-approval-notice"');
    has(html, "personne d’autre ne la vérifie");
    has(html, 'data-testid="mapping-approve"');
    has(html, 'data-testid="mapping-reject"');
    has(html, data.proposals[0]!.fingerprint);
    lacks(html, 'data-testid="second-reviewer-required"');
    lacks(html, 'data-testid="mapping-own-proposal"');
    const ar = render({
      lang: "ar",
      state: ready(data),
      proposalsEnabled: true,
      repository: w.repo,
      initial: { selection: { kind: "proposal", id: w.id } },
    });
    has(ar, "لا يراجعه أحد غيرك");
    // Read-only (writes off): still no control, whoever the proposer is.
    const off = render({
      state: ready(data),
      proposalsEnabled: false,
      repository: w.repo,
      initial: { selection: { kind: "proposal", id: w.id } },
    });
    lacks(off, 'data-testid="mapping-approve"');
  });

  test("the 'waiting for a second reviewer' view lists the proposer's own pending proposals", async () => {
    const w = await proposalWorld(both);
    const html = render({
      state: ready(await w.seenBy(proposer)),
      initial: { view: "waiting_second" },
    });
    has(html, 'data-testid="mapping-proposal-row"');
    has(html, "En attente");
    // Someone who CAN decide has it in their own queue, not in the waiting one.
    const theirs = render({
      state: ready(await w.seenBy(approver)),
      context: approver,
      initial: { view: "waiting_second" },
    });
    has(theirs, 'data-testid="mapping-empty-view"');
  });

  test("a proposed candidate appears in 'Proposés' with the state of its proposal", async () => {
    const w = await proposalWorld(both);
    const html = render({
      state: ready(await w.seenBy(approver)),
      initial: { view: "proposed" },
    });
    count(html, /data-testid="mapping-row"/g, 1, "matches");
    has(html, "En attente");
  });

  test("position disagreement: the approver must acknowledge, the proposer must write a note", async () => {
    const w = await proposalWorld(both);
    // A second candidate proposed against a player whose position differs.
    const second = (await loadAllCandidates(w.repo, {}, proposer))[1]!;
    const options = await loadOptions(w.repo, second, "club", proposer);
    const wrong = options.find(
      (o) => (o.signals as { position?: string }).position === "conflict",
    )!;
    const made = await w.repo.proposeMappings(
      [{ kind: "map", sofascoreCandidateId: second.id, appPlayerId: wrong.appPlayerId }],
      "Je pense qu’il joue à un autre poste cette saison.",
      crypto.randomUUID(),
      proposer,
    );
    const id = (made.proposals[0] as { id: string }).id;
    const proposerView = render({
      state: ready(await w.seenBy(proposer)),
      proposalsEnabled: true,
      repository: w.repo,
      initial: { selection: { kind: "proposal", id } },
    });
    has(proposerView, 'data-testid="mapping-note-form"');
    has(proposerView, "ajoutez une note avant que quelqu’un puisse approuver");
    // Once the note exists the approver is asked to acknowledge it.
    await w.repo.addPositionNote(
      id,
      "Il a changé de poste depuis le mercato.",
      crypto.randomUUID(),
      proposer,
    );
    const approverView = render({
      state: ready(await w.seenBy(approver)),
      proposalsEnabled: true,
      repository: w.repo,
      context: approver,
      initial: { selection: { kind: "proposal", id } },
    });
    has(approverView, 'data-testid="mapping-acknowledge"');
    has(approverView, "Il a changé de poste depuis le mercato.");
  });

  test("an approved proposal says approval maps nothing, offers no decision, and offers the execute step", async () => {
    const w = await proposalWorld(both);
    const proposal = (await w.seenBy(approver)).proposals[0]!;
    await w.repo.decideMappingProposal(
      {
        proposalId: w.id,
        decision: "approve",
        reason: "Preuves relues et concordantes.",
        fingerprint: proposal.fingerprint,
      },
      crypto.randomUUID(),
      approver,
    );
    const html = render({
      state: ready(await w.seenBy(approver)),
      proposalsEnabled: true,
      repository: w.repo,
      context: approver,
      initial: { selection: { kind: "proposal", id: w.id } },
    });
    has(html, 'data-testid="mapping-execution-separate"');
    has(html, "L’approbation ne rapproche rien");
    has(html, "Approuvée");
    lacks(html, 'data-testid="mapping-approve"');
    has(html, 'data-testid="mapping-execute-panel"');
    // And nothing was mapped: approval is not execution, and nothing ran on its own.
    expect(w.repo.mappings).toHaveLength(0);
  });

  test("held and expired proposals say why and offer no decision", async () => {
    const w = await proposalWorld(both);
    w.repo.patchProposal(w.id, {
      status: "identity_conflict",
      effectiveStatus: "identity_conflict",
      holdCode: "identity_conflict",
    });
    const held = render({
      state: ready(await w.seenBy(approver)),
      proposalsEnabled: true,
      repository: w.repo,
      context: approver,
      initial: { selection: { kind: "proposal", id: w.id } },
    });
    has(held, "Conflit d’identité");
    has(held, "le monde a changé");
    lacks(held, 'data-testid="mapping-approve"');
    const heldList = render({ state: ready(await w.seenBy(approver)), initial: { view: "held" } });
    has(heldList, 'data-testid="mapping-proposal-row"');
    w.repo.patchProposal(w.id, { status: "pending", effectiveStatus: "expired", holdCode: null });
    const expired = render({
      state: ready(await w.seenBy(approver)),
      proposalsEnabled: true,
      repository: w.repo,
      context: approver,
      initial: { selection: { kind: "proposal", id: w.id } },
    });
    has(expired, "Cette proposition a expiré");
    lacks(expired, 'data-testid="mapping-approve"');
    expect(render({ state: ready(await w.seenBy(approver)), initial: { view: "held" } })).toContain(
      'data-proposal-status="expired"',
    );
  });
});

describe("French, Arabic and right-to-left", () => {
  test("Arabic renders right-to-left with Arabic copy, and French left-to-right", async () => {
    const { candidates } = await fixture();
    const ar = render({ lang: "ar", state: ready({ candidates }) });
    has(ar, 'dir="rtl"');
    has(ar, 'lang="ar"');
    has(ar, 'data-direction="rtl"');
    has(ar, "غير مطابَقين");
    has(ar, "بانتظار مراجع ثانٍ");
    has(ar, "الصفحة 1 من 41");
    lacks(ar, "Non rapprochés");
    const fr = render({ lang: "fr", state: ready({ candidates }) });
    has(fr, 'dir="ltr"');
    has(fr, "Non rapprochés");
  });

  test("names, ids and fingerprints are isolated so they cannot reorder an Arabic sentence", async () => {
    const { candidates } = await fixture();
    const ar = render({ lang: "ar", state: ready({ candidates }) });
    has(ar, '<bdi dir="auto"');
    has(ar, '<bdi dir="ltr"');
  });

  test("the pieces use logical properties only: no left/right in a class", async () => {
    const { candidates } = await fixture();
    for (const lang of ["fr", "ar"] as const) {
      const html = render({ lang, state: ready({ candidates }) });
      expect(html).not.toMatch(/class="[^"]*\b(ml|mr|pl|pr|left|right)-/);
      expect(html).not.toMatch(/class="[^"]*\btext-(left|right)\b/);
    }
    for (const file of [
      "PlayerMappingsView.tsx",
      "CandidateComparison.tsx",
      "ProposalPanel.tsx",
      "parts.tsx",
    ]) {
      const source = await Bun.file(new URL(`./${file}`, import.meta.url)).text();
      expect(/\b(ml|mr|pl|pr)-\d|text-(left|right)\b|\b(left|right)-\d/.test(source)).toBe(false);
    }
  });

  test("both languages carry the same copy: same keys, nothing empty, every refusal code written", () => {
    const keys = (value: unknown, prefix = ""): string[] =>
      typeof value === "function"
        ? [prefix]
        : value && typeof value === "object"
          ? Object.entries(value).flatMap(([k, v]) => keys(v, `${prefix}.${k}`))
          : [prefix];
    expect(keys(PLAYER_MAPPING_COPY.ar).sort()).toEqual(keys(PLAYER_MAPPING_COPY.fr).sort());
    const empties: string[] = [];
    const walk = (value: unknown, path: string) => {
      if (typeof value === "string" && value.trim() === "") empties.push(path);
      else if (value && typeof value === "object")
        for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
    };
    walk(PLAYER_MAPPING_COPY.fr, "fr");
    walk(PLAYER_MAPPING_COPY.ar, "ar");
    expect(empties).toEqual([]);
    for (const code of MAPPING_ERROR_CODES) {
      expect(PLAYER_MAPPING_COPY.fr.errors[code]).toBeTruthy();
      expect(PLAYER_MAPPING_COPY.ar.errors[code]).toBeTruthy();
    }
    // The Arabic is Arabic: every Arabic sentence carries at least one Arabic letter.
    for (const [key, value] of Object.entries(PLAYER_MAPPING_COPY.ar.errors))
      expect(/[؀-ۿ]/.test(value), key).toBe(true);
  });
});

describe("no direct browser table access", () => {
  test("the screen's files import no Supabase client and name no table", async () => {
    for (const file of [
      "PlayerMappingsScreen.tsx",
      "PlayerMappingsView.tsx",
      "CandidateComparison.tsx",
      "ProposalPanel.tsx",
      "use-player-mappings.ts",
      "parts.tsx",
    ]) {
      const source = await Bun.file(new URL(`./${file}`, import.meta.url)).text();
      expect(
        /@supabase|integrations\/supabase|\.from\(["'`]|football_player_mapping_|app_private/.test(
          source,
        ),
        file,
      ).toBe(false);
    }
  });

  test("the route reaches the data only through the repository's RPC door", async () => {
    const source = await Bun.file(
      new URL("../../../routes/admin.football.player-mappings.tsx", import.meta.url),
    ).text();
    has(source, "SupabasePlayerMappingRepository");
    has(source, "getAdminApi()");
    expect(/\.from\(["'`]/.test(source)).toBe(false);
  });
});

// A reference so the unused-type import above stays honest.

describe("the execute control", () => {
  async function worldIn(state: "pending" | "approved" | "rejected" | "approved-expired") {
    const w = await proposalWorld(both);
    const proposal = (await w.seenBy(approver)).proposals[0]!;
    if (state !== "pending") {
      await w.repo.decideMappingProposal(
        {
          proposalId: w.id,
          decision: state === "rejected" ? "reject" : "approve",
          reason: "Preuves relues et concordantes.",
          fingerprint: proposal.fingerprint,
        },
        crypto.randomUUID(),
        approver,
      );
    }
    if (state === "approved-expired") w.repo.patchProposal(w.id, { effectiveStatus: "expired" });
    return w;
  }
  const show = async (
    w: Awaited<ReturnType<typeof worldIn>>,
    extra: Partial<PlayerMappingsViewProps> = {},
  ) =>
    render({
      state: ready(await w.seenBy(approver)),
      proposalsEnabled: true,
      repository: w.repo,
      context: approver,
      initial: { selection: { kind: "proposal", id: w.id } },
      ...extra,
    });

  test("1. a pending proposal has no execute control", async () => {
    const html = await show(await worldIn("pending"));
    has(html, 'data-testid="mapping-proposal"');
    lacks(html, "mapping-execute");
  });

  test("2. a rejected proposal has no execute control", async () => {
    const html = await show(await worldIn("rejected"));
    has(html, "Rejetée");
    lacks(html, "mapping-execute");
  });

  test("3. an expired approval has no execute control", async () => {
    const html = await show(await worldIn("approved-expired"));
    has(html, 'data-testid="mapping-proposal"');
    lacks(html, "mapping-execute");
  });

  test("4. an approved proposal shows the exact fingerprint, the target, and a button that waits for the typed phrase", async () => {
    const w = await worldIn("approved");
    const html = await show(w);
    const proposal = (await w.seenBy(approver)).proposals[0]!;
    has(html, 'data-testid="mapping-execute-panel"');
    has(html, 'data-testid="mapping-execute-fingerprint"');
    // The fingerprint appears in the execute panel as well as the proposal facts.
    expect(html.split(proposal.fingerprint).length - 1).toBeGreaterThanOrEqual(2);
    has(html, 'data-testid="mapping-execute-provider"');
    has(html, 'data-testid="mapping-execute-external-id"');
    has(html, 'data-testid="mapping-execute-app-player"');
    has(html, proposal.sofascoreExternalId!);
    has(html, proposal.appPlayerId!);
    has(html, "EXECUTE_PLAYER_MAPPING");
    // Nothing typed yet: the button is disabled and nothing has run.
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="mapping-execute"/);
    expect(w.repo.mappings).toHaveLength(0);
  });

  test("the control is only drawn when writes are on and the viewer may manage mappings", async () => {
    const w = await worldIn("approved");
    lacks(await show(w, { proposalsEnabled: false }), "mapping-execute");
    lacks(await show(w, { viewer: { canManage: false } }), "mapping-execute");
  });

  test("11. the typed phrase must match exactly", () => {
    expect(isConfirmationTyped("")).toBe(false);
    expect(isConfirmationTyped("execute_player_mapping")).toBe(false);
    expect(isConfirmationTyped("EXECUTE")).toBe(false);
    expect(isConfirmationTyped("EXECUTE_PLAYER_MAPPING_NOW")).toBe(false);
    expect(isConfirmationTyped("EXECUTE_PLAYER_MAPPING")).toBe(true);
    expect(isConfirmationTyped("  EXECUTE_PLAYER_MAPPING \n")).toBe(true);
  });

  test("15. French and Arabic say it in words, the phrase stays Latin, and Arabic is right to left", async () => {
    const w = await worldIn("approved");
    const fr = await show(w);
    has(fr, "Exécuter cette proposition approuvée");
    has(fr, "Cible du rapprochement");
    has(fr, "Exécuter le rapprochement");
    const ar = await show(w, { lang: "ar" });
    has(ar, "تنفيذ هذا الاقتراح المعتمَد");
    has(ar, "هدف المطابقة");
    has(ar, "تنفيذ المطابقة");
    has(ar, "EXECUTE_PLAYER_MAPPING");
    has(ar, 'dir="rtl"');
  });
});

export type _Unused = ProposalDto | InMemoryPlayerMappingRepository;
