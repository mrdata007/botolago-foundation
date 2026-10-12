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
    expect(count(html, /data-testid="sofascore-queue-entry"/g)).toBe(7);
    has(html, "7 joueurs à confirmer");
    has(html, "Joueur Exemple Alpha");
  });

  test("shows the plain explanation of each reason", () => {
    for (const reason of SOFASCORE_QUEUE_REASONS) {
      has(html, `data-reason="${reason}"`);
      has(html, SOFASCORE_QUEUE_COPY.fr.reasons[reason].title);
    }
  });

  test("offers a confirm button only for selectable candidates", () => {
    // 4 entries have a selectable candidate: Alpha has 2, Epsilon 1, Zeta 1, the Arabic one 1 = 5.
    expect(count(html, /data-testid="sofascore-confirm-open"/g)).toBe(5);
    expect(count(html, /data-locked="true"/g)).toBe(1);
    has(html, "Déjà rattaché au joueur SofaScore 811111");
  });

  test("an entry with no candidate has an explanation and no button", () => {
    expect(count(html, /data-testid="sofascore-queue-no-candidates"/g)).toBe(2);
    has(html, "Il n’existe pas encore de bouton pour créer un joueur");
  });

  test("a row that could not be read is reported, not drawn", () => {
    has(html, "1 ligne de la liste était illisible et a été ignorée.");
    lacks(html, "ligne sans identifiant");
  });

  test("a reader sees the list but no confirm control", () => {
    const reader = render({ canManage: false });
    lacks(reader, "sofascore-confirm-open");
    has(reader, "sofascore-queue-reader-notice");
    expect(count(reader, /data-testid="sofascore-queue-entry"/g)).toBe(7);
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
    has(withPanel, "ré-essayé automatiquement");
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
    has(out, "ré-essayé automatiquement d’ici environ 15 minutes");
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
    expect(count(html, /data-testid="sofascore-queue-entry"/g)).toBe(7);
    has(html, "7 لاعبين بانتظار التأكيد");
  });

  test("shows the Arabic explanation of each reason and the confirm buttons", () => {
    for (const reason of SOFASCORE_QUEUE_REASONS) {
      has(html, SOFASCORE_QUEUE_COPY.ar.reasons[reason].title);
    }
    expect(count(html, /data-testid="sofascore-confirm-open"/g)).toBe(5);
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
