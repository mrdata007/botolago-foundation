import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToString } from "react-dom/server";

import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import type { ChipKey } from "@/lib/fantasy-engine";
import { PickTeamConfirmBar } from "./PickTeamConfirmBar";

/**
 * BG-0155 (1) — Pick Team keeps unsaved work in view and asks before dropping
 * it.
 *
 * The bar renders with `react-dom/server` inside the language provider (its
 * server render is French); the Arabic wording is read from the Arabic
 * dictionary, filled the way the bar fills it. How the route wires it (the header
 * keeps Back, the guard is called on every render, the bar steps aside for
 * the substitution bar) is pinned on the route's source, comments stripped,
 * because the route needs a router, a data layer and a DOM to run. The
 * measured checks — the Confirmer's box above the bottom menu after scrolling
 * to the bench, the prompt on Accueil — are Playwright runs recorded in the
 * BG-0155 pull request.
 */

const ROOT = join(import.meta.dir, "..", "..", "..");
const code = (path: string) =>
  readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/\s+/g, " ");

function render(props: { pendingChip: ChipKey | null; saving: boolean }): string {
  return renderToString(
    <I18nProvider>
      <PickTeamConfirmBar {...props} onCancel={() => {}} onConfirm={() => {}} />
    </I18nProvider>,
  ).replace(/<!-- -->/g, "");
}
/** The attribute itself, not the `disabled:` variants in the class list. */
const DISABLED = /\sdisabled=""/;
const buttons = (html: string) =>
  [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({
    attrs: m[1],
    label: m[2].replace(/<[^>]+>/g, "").trim(),
  }));

const CHIPS = ["bench_boost", "free_hit", "triple_captain", "wildcard"] as const;
const statusOf = (html: string) => /<p [^>]*role="status"[^>]*>([^<]*)<\/p>/.exec(html)?.[1];

describe("the status line", () => {
  it("says the changes are not saved, in the brief's words", () => {
    expect(statusOf(render({ pendingChip: null, saving: false }))).toBe(
      "Modifications non enregistrées",
    );
    expect(dictionaries.ar["fantasy.team.unsaved.status"]).toBe("تعديلات غير محفوظة");
  });

  it("names a pending chip by the name the chips row gives it", () => {
    expect(statusOf(render({ pendingChip: "bench_boost", saving: false }))).toBe(
      "Bench Boost : à confirmer",
    );
    expect(statusOf(render({ pendingChip: "free_hit", saving: false }))).toBe(
      "Free Hit : à confirmer",
    );
    expect(statusOf(render({ pendingChip: "triple_captain", saving: false }))).toBe(
      "Triple Capitaine : à confirmer",
    );
    for (const chip of CHIPS) {
      expect(statusOf(render({ pendingChip: chip, saving: false }))).toBe(
        `${dictionaries.fr[`fantasy.chip.${chip}`]} : à confirmer`,
      );
    }
  });

  it("the Arabic line fills the same {chip} slot with the chip's Arabic name", () => {
    // The server render is French; the bar fills the template the same way
    // in both languages, so the Arabic result is the template filled here.
    const ar = (chip: (typeof CHIPS)[number]) =>
      dictionaries.ar["fantasy.team.unsaved.chip"].replace(
        "{chip}",
        dictionaries.ar[`fantasy.chip.${chip}`],
      );
    expect(dictionaries.ar["fantasy.team.unsaved.chip"]).toBe("{chip}: بانتظار التأكيد");
    expect(ar("triple_captain")).toBe("القائد الثلاثي: بانتظار التأكيد");
    expect(ar("bench_boost")).toBe("تعزيز الاحتياط: بانتظار التأكيد");
    expect(ar("free_hit")).toBe("الضربة الحرة: بانتظار التأكيد");
  });

  it("the leave prompt is the brief's sentence in both languages", () => {
    expect(dictionaries.fr["fantasy.team.unsaved.leave_confirm"]).toBe(
      "Vos changements ne sont pas confirmés et ne compteront pas pour cette journée. Quitter quand même ?",
    );
    expect(dictionaries.ar["fantasy.team.unsaved.leave_confirm"]).toBe(
      "لم تُؤكَّد تغييراتك ولن تُحتسب في هذه الجولة. هل تريد المغادرة رغم ذلك؟",
    );
  });
});

describe("the bar", () => {
  const html = render({ pendingChip: null, saving: false });

  it("announces what is waiting, politely, before its two buttons", () => {
    const status = /<p ([^>]*)>([^<]*)<\/p>/.exec(html);
    expect(status?.[1]).toContain('role="status"');
    expect(status?.[1]).toContain('aria-live="polite"');
    expect(status?.[2]).toBe("Modifications non enregistrées");
    expect(html.indexOf('role="status"')).toBeLessThan(html.indexOf("<button"));
  });

  it("holds Annuler then Confirmer, side by side, and nothing else to press", () => {
    expect(buttons(html).map((b) => b.label)).toEqual(["Annuler", "Confirmer"]);
    expect(html).toContain("grid grid-cols-2 gap-2");
    for (const b of buttons(html)) expect(b.attrs).not.toMatch(DISABLED);
  });

  it("names a pending chip instead", () => {
    expect(render({ pendingChip: "free_hit", saving: false })).toContain("Free Hit : à confirmer");
  });

  it("while saving, says so and takes no second tap on either button", () => {
    const saving = buttons(render({ pendingChip: null, saving: true }));
    expect(saving.map((b) => b.label)).toEqual(["Annuler", "Enregistrement…"]);
    for (const b of saving) expect(b.attrs).toMatch(DISABLED);
  });

  it("is the Transfers confirmation bar's pattern: sticks above the bottom menu, and to the foot from md", () => {
    const bar = /<div data-testid="pick-team-confirm-bar" class="([^"]*)"/.exec(html)?.[1] ?? "";
    for (const token of [
      "sticky",
      "bottom-[var(--bottomnav-h)]",
      "md:bottom-0",
      "md:pb-[max(env(safe-area-inset-bottom),0.75rem)]",
      "z-30",
      "border-t",
      "shadow-[var(--ui-shadow-raised)]",
      "bg-[color:var(--ui-surface)]",
      "px-[var(--ui-gutter)]",
    ]) {
      expect(bar.split(" ")).toContain(token);
    }
    // Logical properties only: nothing here points left or right.
    expect(bar).not.toMatch(/(^|\s)(md:)?(ml|mr|pl|pr|left|right)-/);
  });
});

describe("Pick Team wires the bar and the leave guard (src/routes/fantasy.team.tsx)", () => {
  const route = code("src/routes/fantasy.team.tsx");
  const body = route.slice(route.indexOf("function PickTeamBody()"));

  it("the frame lets a sticky bar stick from md", () => {
    expect(route).toContain("<FantasyFrame bottomNav stickyBottomBar>");
  });

  it("the header keeps its Back pill: no ✕ in its place and no Confirmer in it", () => {
    const header = /<UiHeader kicker=\{`\$\{t\("fpl\.gameweek"\)\}[^]*?\/>/.exec(body)?.[0] ?? "";
    expect(header).toContain('backTo="/fantasy"');
    expect(header).not.toContain("leading=");
    expect(header).not.toContain("trailing=");
    expect(route).not.toContain("UiIconButton");
    // One Confirmer on the screen: the bar's.
    expect(route).not.toContain('t("fpl.confirm")');
  });

  it("shows the bar while something is pending, except while a substitute is chosen", () => {
    expect(body).toContain(
      "{confirmPending && !selectedId ? ( <PickTeamConfirmBar pendingChip={pendingChip} saving={saving} onCancel={cancelChanges} onConfirm={onConfirm} /> ) : null}",
    );
    expect(body).toContain("const confirmPending = dirty || pendingChip !== null;");
    expect(body).toContain(
      "const onConfirm = () => (pendingChip ? void confirmChip() : void save());",
    );
  });

  it("guards leaving with the same condition, on every render, before the early return", () => {
    const guard = body.indexOf("useUnsavedChangesGuard(");
    const earlyReturn = body.indexOf('if (screen.phase !== "ready" || !team || !gameweek)');
    expect(guard).toBeGreaterThan(-1);
    expect(earlyReturn).toBeGreaterThan(guard);
    expect(body.slice(guard, earlyReturn)).toContain(
      'useUnsavedChangesGuard( (localSquad !== null || pendingChip !== null) && !saving, t("fantasy.team.unsaved.leave_confirm"), );',
    );
    // Once, at the body's top level (straight after the draft effect), not
    // behind a condition or inside a callback.
    expect(body.match(/useUnsavedChangesGuard\(/g)).toHaveLength(1);
    expect(body.slice(0, guard).trimEnd().endsWith("}, [draftKey, team]);")).toBe(true);
  });

  it("a save and a cancel clear what the guard reads", () => {
    const cancel = body.slice(body.indexOf("const cancelChanges = () =>"));
    expect(cancel.slice(0, cancel.indexOf("};"))).toContain("setLocalSquad(null);");
    expect(cancel.slice(0, cancel.indexOf("};"))).toContain("setPendingChip(null);");
    const save = body.slice(body.indexOf("const save = async"), body.indexOf("const chipViews ="));
    // Cloud success and local save both drop the pending line-up.
    expect(save.match(/setLocalSquad\(null\);/g)?.length).toBe(2);
    const chip = body.slice(
      body.indexOf("const confirmChip = async"),
      body.indexOf("const cancelActiveChip = async"),
    );
    expect(chip).toContain("finally { setPendingChip(null); setSaving(false); }");
  });

  it("keeps the cloud draft as it was: saved on every change, removed only by Annuler", () => {
    expect(body).toContain("fantasyDraftsStore.save<TeamDraftPayload>(draftKey,");
    expect(body).toContain("if (draftKey) fantasyDraftsStore.remove(draftKey);");
    expect(body).toContain("const entry = fantasyDraftsStore.read<TeamDraftPayload>(draftKey);");
  });
});
