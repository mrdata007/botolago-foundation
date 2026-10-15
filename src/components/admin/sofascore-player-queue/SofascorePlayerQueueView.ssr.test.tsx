import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import {
  SOFASCORE_QUEUE_ERROR_CODES,
  SOFASCORE_QUEUE_REASONS,
} from "@/backend/football/identity/sofascore-player-queue";
import {
  InMemorySofascorePlayerQueueRepository,
  buildSampleSofascoreQueue,
} from "@/backend/football/identity/sofascore-player-queue-sample";
import { SOFASCORE_QUEUE_COPY, reasonCopy, sofascoreQueueErrorMessage, type Lang } from "./copy";
import {
  SofascorePlayerQueueView,
  type SofascorePlayerQueueViewProps,
} from "./SofascorePlayerQueueView";

const noop = () => {};
const sample = buildSampleSofascoreQueue();
const repo = new InMemorySofascorePlayerQueueRepository();

function render(props: Partial<SofascorePlayerQueueViewProps> = {}, lang: Lang = "fr") {
  return renderToString(
    <SofascorePlayerQueueView
      lang={lang}
      state={{ status: "ready", data: sample, version: 0 }}
      canManage
      onReload={noop}
      resolve={(a, b) => repo.resolve(a, b)}
      {...props}
    />,
  );
}

/** The screen with every action wired, as the live route draws it. */
function renderAll(props: Partial<SofascorePlayerQueueViewProps> = {}, lang: Lang = "fr") {
  return render(
    {
      linkAlias: (a, b) => repo.linkAlias(a, b),
      createPlayer: (a, input) => repo.createPlayer(a, input),
      listOptions: (a, q) => repo.listOptions(a, q),
      ...props,
    },
    lang,
  );
}

function has(html: string, needle: string): void {
  if (!html.replace(/[\u2068\u2069]/g, "").includes(needle))
    throw new Error(`expected the page to contain: ${needle}`);
}
function lacks(html: string, needle: string): void {
  if (html.includes(needle)) throw new Error(`expected the page NOT to contain: ${needle}`);
}
function count(html: string, pattern: RegExp): number {
  return (html.match(pattern) ?? []).length;
}

describe("copy", () => {
  test("French and Arabic have the same shape and no empty string", () => {
    const walk = (value: unknown, path: string, out: string[]) => {
      if (typeof value === "string") out.push(`${path}${value.trim() === "" ? " (empty)" : ""}`);
      else if (typeof value === "function") {
        const sample = (value as (...a: string[]) => string)("X", "Y");
        out.push(`${path}${sample.trim() === "" ? " (empty)" : ""}`);
      } else if (value && typeof value === "object")
        for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`, out);
    };
    const fr: string[] = [];
    const ar: string[] = [];
    walk(SOFASCORE_QUEUE_COPY.fr, "", fr);
    walk(SOFASCORE_QUEUE_COPY.ar, "", ar);
    expect(ar).toEqual(fr);
    expect(fr.filter((p) => p.endsWith("(empty)"))).toEqual([]);
  });

  test("every reason and every refusal code has a sentence in both languages", () => {
    for (const lang of ["fr", "ar"] as const) {
      const copy = SOFASCORE_QUEUE_COPY[lang];
      for (const reason of SOFASCORE_QUEUE_REASONS) {
        expect(reasonCopy(copy, reason)).not.toBe(copy.unknownReason);
      }
      for (const code of [...SOFASCORE_QUEUE_ERROR_CODES, "queue_unavailable"]) {
        expect((copy.errors as Record<string, string>)[code]?.trim().length).toBeGreaterThan(0);
      }
      expect(sofascoreQueueErrorMessage(copy, "brand_new_code")).toBe(
        copy.errors.queue_unavailable,
      );
    }
  });

  test("the shirt-based reasons are described by number and club, in both languages", () => {
    expect(SOFASCORE_QUEUE_COPY.fr.reasons.ambiguous_shirt.body).toContain("numéro de maillot");
    expect(SOFASCORE_QUEUE_COPY.ar.reasons.ambiguous_shirt.body).toContain("رقم القميص");
    expect(SOFASCORE_QUEUE_COPY.fr.reasons.no_candidate.body).toContain("ce numéro");
    expect(SOFASCORE_QUEUE_COPY.fr.reasons.no_candidate.body).not.toContain("ce nom");
    expect(Object.keys(SOFASCORE_QUEUE_COPY.fr.reasons)).not.toContain("awaiting_second_match");
  });

  test("the no_candidate explanation says the match is not held for a player who scored nothing", () => {
    expect(SOFASCORE_QUEUE_COPY.fr.reasons.no_candidate.body).toContain("n’est pas mis en attente");
  });
});

describe("SofascorePlayerQueueView, French", () => {
  const html = render();

  test("is left-to-right French and draws every entry", () => {
    has(html, 'dir="ltr"');
    has(html, 'lang="fr"');
    has(html, 'data-direction="ltr"');
    expect(count(html, /data-testid="sofascore-queue-entry"/g)).toBe(12);
    has(html, "12 joueurs à confirmer");
    has(html, "Joueur Exemple Alpha");
  });

  test("shows the plain explanation of each reason", () => {
    for (const reason of SOFASCORE_QUEUE_REASONS) {
      has(html, `data-reason="${reason}"`);
      has(html, SOFASCORE_QUEUE_COPY.fr.reasons[reason].title);
    }
  });

  test("offers a confirm button only for selectable candidates", () => {
    // Selectable candidates: Alpha 2, Epsilon 1, Zeta 1, the Arabic one 1, Eta 1, Thêta 2, Mu 2, Omicron 1 = 11.
    expect(count(html, /data-testid="sofascore-confirm-open"/g)).toBe(11);
    expect(count(html, /data-locked="true"/g)).toBe(1);
    has(html, "Déjà rattaché au joueur SofaScore 811111");
  });

  test("an entry with no candidate has an explanation and no confirm button", () => {
    expect(count(html, /data-testid="sofascore-queue-no-candidates"/g)).toBe(3);
    has(html, "Aucun joueur BotolaGO à proposer pour celui-ci.");
    // Without the search and create actions, the pointer to them is not shown.
    lacks(html, "Cherchez-le dans le catalogue");
    lacks(html, "Il n’existe pas encore de bouton");
  });

  test("a row that could not be read is reported, not drawn", () => {
    has(html, "1 ligne de la liste était illisible et a été ignorée.");
    lacks(html, "ligne sans identifiant");
  });

  test("a reader sees the list but no confirm control", () => {
    const reader = render({ canManage: false });
    lacks(reader, "sofascore-confirm-open");
    has(reader, "sofascore-queue-reader-notice");
    expect(count(reader, /data-testid="sofascore-queue-entry"/g)).toBe(12);
    lacks(html, "sofascore-queue-reader-notice");
  });

  test("a pending confirmation names both players and offers yes and cancel", () => {
    const first = sample.entries[0]!;
    const withPanel = render({
      initial: {
        confirming: {
          sofascorePlayerId: first.sofascorePlayerId,
          playerId: first.candidates[0]!.playerId,
        },
      },
    });
    has(withPanel, 'data-testid="sofascore-confirm-panel"');
    has(
      withPanel,
      "Rattacher le joueur SofaScore « Joueur Exemple Alpha » au joueur BotolaGO « Alpha P. » ?",
    );
    has(withPanel, "réessayé automatiquement");
    has(withPanel, "Oui, rattacher");
    has(withPanel, "Annuler");
    expect(count(withPanel, /data-testid="sofascore-confirm-panel"/g)).toBe(1);
  });

  test("a confirmation on a locked candidate or by a reader never draws its panel", () => {
    const entry = sample.entries.find((e) => e.reason === "candidate_already_mapped")!;
    const locked = render({
      initial: {
        confirming: {
          sofascorePlayerId: entry.sofascorePlayerId,
          playerId: entry.candidates[0]!.playerId,
        },
      },
    });
    lacks(locked, "sofascore-confirm-panel");
    const first = sample.entries[0]!;
    const asReader = render({
      canManage: false,
      initial: {
        confirming: {
          sofascorePlayerId: first.sofascorePlayerId,
          playerId: first.candidates[0]!.playerId,
        },
      },
    });
    lacks(asReader, "sofascore-confirm-panel");
  });

  test("the success notice and an entry error are announced", () => {
    const first = sample.entries[0]!;
    const out = render({
      initial: {
        notice: SOFASCORE_QUEUE_COPY.fr.done("A", "B"),
        entryErrors: {
          [first.sofascorePlayerId]: SOFASCORE_QUEUE_COPY.fr.errors.sofascore_mapping_conflict,
        },
      },
    });
    has(out, "sofascore-queue-notice");
    has(out, "réessayé automatiquement d’ici environ 15 minutes");
    has(out, "sofascore-queue-entry-error");
  });

  test("empty, loading and error states", () => {
    has(
      render({ state: { status: "ready", data: { entries: [], skipped: 0 } } }),
      "sofascore-queue-empty",
    );
    has(render({ state: { status: "loading" } }), "sofascore-queue-loading");
    const failed = render({ state: { status: "error", code: "permission_missing" } });
    has(failed, "sofascore-queue-error");
    has(failed, "Votre rôle n’a pas la permission de confirmer un joueur.");
    has(failed, "sofascore-queue-retry");
  });

  test("a malformed sample cannot crash the render", () => {
    expect(() =>
      render({ state: { status: "ready", data: { entries: [], skipped: 3 } } }),
    ).not.toThrow();
  });

  test("never shows an authorship notice", () => {
    for (const out of [html, render({}, "ar")]) {
      expect(out.toLowerCase()).not.toContain("intelligence artificielle");
      expect(out.toLowerCase()).not.toContain("generated");
      expect(out).not.toContain("الذكاء الاصطناعي");
    }
  });
});

describe("SofascorePlayerQueueView, Arabic (right to left)", () => {
  const html = render({}, "ar");

  test("is right-to-left Arabic", () => {
    has(html, 'dir="rtl"');
    has(html, 'lang="ar"');
    has(html, 'data-direction="rtl"');
    expect(count(html, /data-testid="sofascore-queue-entry"/g)).toBe(12);
    has(html, "12 لاعبين بانتظار التأكيد");
  });

  test("shows the Arabic explanation of each reason and the confirm buttons", () => {
    for (const reason of SOFASCORE_QUEUE_REASONS) {
      has(html, SOFASCORE_QUEUE_COPY.ar.reasons[reason].title);
    }
    expect(count(html, /data-testid="sofascore-confirm-open"/g)).toBe(11);
    has(html, "تأكيد هذا اللاعب");
    has(html, "مرتبط أصلًا بلاعب SofaScore 811111");
  });

  test("ids, dates and shirt numbers are isolated as left-to-right data", () => {
    has(html, '<bdi dir="ltr"');
    has(html, "2026-10-10 18:05 UTC");
  });

  test("the confirm panel is in Arabic", () => {
    const first = sample.entries[0]!;
    const out = render(
      {
        initial: {
          confirming: {
            sofascorePlayerId: first.sofascorePlayerId,
            playerId: first.candidates[0]!.playerId,
          },
        },
      },
      "ar",
    );
    has(out, "نعم، اربطه");
    has(out, "إلغاء");
    has(out, "خلال نحو 15 دقيقة");
  });

  test("no physical left/right classes are used", () => {
    expect(html).not.toMatch(/class="[^"]*\b(?:ml|mr|pl|pr|left|right|text-left|text-right)-/);
  });
});

describe("the review actions (20261014170000)", () => {
  const html = renderAll();
  const locked = sample.entries.find((e) => e.reason === "candidate_already_mapped")!;
  const gamma = sample.entries.find((e) => e.sofascorePlayerId === "900004")!;
  const options = {
    sofascorePlayerId: gamma.sofascorePlayerId,
    query: null,
    skipped: 0,
    players: [
      {
        playerId: "00000000-0000-4000-8000-000000000021",
        fullName: "Joueur Exemple Kappa",
        displayName: "Kappa",
        position: "goalkeeper" as const,
        teamId: gamma.teamId,
        teamName: "Club Exemple Tanger",
        shirtNumber: 16,
        inClub: true,
        sofascoreId: null,
        sofascoreActive: null,
        sofascoreAliasIds: [],
      },
      {
        playerId: "00000000-0000-4000-8000-000000000022",
        fullName: "Joueur Exemple Omicron",
        displayName: null,
        position: "goalkeeper" as const,
        teamId: gamma.teamId,
        teamName: "Club Exemple Tanger",
        shirtNumber: 30,
        inClub: true,
        sofascoreId: "822222",
        sofascoreActive: true,
        sofascoreAliasIds: ["833333"],
      },
      {
        playerId: "00000000-0000-4000-8000-000000000023",
        fullName: "لاعب تجريبي سابع",
        displayName: null,
        position: "forward" as const,
        teamId: null,
        teamName: null,
        shirtNumber: null,
        inClub: false,
        sofascoreId: "844444",
        sofascoreActive: false,
        sofascoreAliasIds: [],
      },
    ],
  };

  test("the existing confirm buttons and sentences are unchanged", () => {
    expect(count(html, /data-testid="sofascore-confirm-open"/g)).toBe(11);
    has(html, "Déjà rattaché au joueur SofaScore 811111");
    expect(count(html, /data-testid="sofascore-queue-entry"/g)).toBe(12);
  });

  test("a candidate already linked can be linked as a second id, and still says why", () => {
    expect(count(html, /data-testid="sofascore-alias-open"/g)).toBe(1);
    has(html, "Rattacher comme second identifiant");
    has(html, "Déjà rattaché au joueur SofaScore 811111");
  });

  test("every card offers the search; create only where the database allows it", () => {
    expect(count(html, /data-testid="sofascore-search-open"/g)).toBe(12);
    expect(count(html, /data-testid="sofascore-create-open"/g)).toBe(2);
    expect(count(html, /data-testid="sofascore-create-unavailable"/g)).toBe(10);
    has(html, "Cherchez-le dans le catalogue ci-dessous, ou créez-le à partir de SofaScore");
  });

  test("a reader sees none of the new actions", () => {
    const reader = renderAll({ canManage: false });
    lacks(reader, "sofascore-queue-more");
    lacks(reader, "sofascore-alias-open");
    lacks(reader, "sofascore-search-open");
  });

  test("the second-id confirmation names both players and the main id kept", () => {
    const out = renderAll({
      initial: {
        confirming: {
          sofascorePlayerId: locked.sofascorePlayerId,
          playerId: locked.candidates[0]!.playerId,
          kind: "alias",
        },
      },
    });
    has(out, 'data-testid="sofascore-alias-panel"');
    has(out, "SofaScore a deux profils pour cette personne.");
    has(out, "« Joueur Exemple Bêta » à « Bêta » comme second identifiant ?");
    has(out, "garde son identifiant principal 811111");
    has(out, "Oui, rattacher comme second identifiant");
    lacks(out, 'data-testid="sofascore-confirm-panel"');
  });

  test("an ordinary confirmation is never drawn on a linked candidate", () => {
    const out = renderAll({
      initial: {
        confirming: {
          sofascorePlayerId: locked.sofascorePlayerId,
          playerId: locked.candidates[0]!.playerId,
          kind: "link",
        },
      },
    });
    lacks(out, "sofascore-confirm-panel");
    lacks(out, "sofascore-alias-panel");
  });

  test("the search shows the squad, each player's SofaScore state and the one action that fits", () => {
    const out = renderAll({
      initial: { panel: { sofascorePlayerId: "900004", panel: "search" }, options },
    });
    has(out, 'data-testid="sofascore-search-panel"');
    has(out, "3 joueurs dans l’effectif du club");
    has(out, 'data-action="link"');
    has(out, 'data-action="alias"');
    has(out, 'data-action="none"');
    expect(count(out, /data-testid="sofascore-option-link"/g)).toBe(1);
    expect(count(out, /data-testid="sofascore-option-alias"/g)).toBe(1);
    has(out, "Pas encore d’identifiant SofaScore");
    has(out, "Identifiant SofaScore 822222");
    has(out, "Second identifiant : 833333");
    has(out, "Son lien SofaScore est désactivé");
    has(out, "Sans club cette saison");
    has(out, "Laissez vide pour voir l’effectif du club");
  });

  test("a confirmation from the search is drawn in the search, not on the candidates", () => {
    const out = renderAll({
      initial: {
        panel: { sofascorePlayerId: "900004", panel: "search" },
        options,
        confirming: {
          sofascorePlayerId: "900004",
          playerId: "00000000-0000-4000-8000-000000000022",
          kind: "alias",
          from: "search",
        },
      },
    });
    expect(count(out, /data-testid="sofascore-alias-panel"/g)).toBe(1);
    has(out, "garde son identifiant principal 822222");
  });

  test("the create panel is pre-filled from SofaScore and says what will happen", () => {
    const out = renderAll({ initial: { panel: { sofascorePlayerId: "900004", panel: "create" } } });
    has(out, 'data-testid="sofascore-create-panel"');
    has(out, "Créer le joueur à partir de SofaScore");
    has(out, `value="${gamma.name}"`);
    has(out, 'value="1"');
    has(out, '<option value="goalkeeper" selected="">Gardien</option>');
    has(out, "Club Exemple Tanger");
    has(out, "au marché Fantasy au prix de départ");
    has(out, "Créer et rattacher");
  });

  test("the create panel is never drawn where the database says no", () => {
    const out = renderAll({ initial: { panel: { sofascorePlayerId: "900001", panel: "create" } } });
    lacks(out, "sofascore-create-panel");
  });

  test("the new sentences exist in Arabic, right-to-left", () => {
    const out = renderAll(
      {
        initial: {
          panel: { sofascorePlayerId: "900004", panel: "search" },
          options,
          confirming: {
            sofascorePlayerId: locked.sofascorePlayerId,
            playerId: locked.candidates[0]!.playerId,
            kind: "alias",
          },
        },
      },
      "ar",
    );
    has(out, 'dir="rtl"');
    has(out, "لدى SofaScore ملفّان لهذا الشخص.");
    has(out, "نعم، اربطه كمعرّف ثانٍ");
    has(out, "البحث في الفهرس");
    has(out, "3 لاعبين في تشكيلة النادي");
    has(out, "إنشاء هذا اللاعب");
    expect(out).not.toMatch(/class="[^"]*\b(?:ml|mr|pl|pr|left|right|text-left|text-right)-/);
  });

  test("never shows an authorship notice in the new actions", () => {
    const out = renderAll({ initial: { panel: { sofascorePlayerId: "900004", panel: "create" } } });
    expect(out.toLowerCase()).not.toMatch(/intelligence artificielle|ai-generated|généré par/);
  });
});
