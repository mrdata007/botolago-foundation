import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Launch P1 — destructive Admin actions must not be reachable in one press.
 *
 * `components/admin/destructive-action.test.ts` proves the state machine is
 * safe. This file proves the console actually *uses* it: a correct reducer that
 * no route is wired to would leave the console exactly as dangerous as the
 * review found it, with a green test suite on top.
 *
 * It is a source-shape check rather than a render test, matching
 * `index.home-structure.test.ts` — this repository has no DOM test setup.
 */

const COMPONENT = "../components/admin/AdminDestructiveAction.tsx";

/** The routes that carry destructive or irreversible operations. */
const GUARDED_ROUTES = ["admin.staff.$principalId.tsx", "admin.approvals.tsx"] as const;

function read(relativePath: string): string {
  return readFileSync(join(import.meta.dir, relativePath), "utf8");
}

/** Every value of a `className` attribute, so prose in comments is not scanned. */
function classNames(source: string): string {
  const matches = source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{([^}]*)\})/g);
  return [...matches].map((match) => match[1] ?? match[2] ?? match[3] ?? "").join(" ");
}

/** Source with comments removed, for checks about what actually renders. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("no Admin surface keeps a page-level motive", () => {
  // This single shared string was the defect: eight characters typed about one
  // object armed the destructive button of every other object on the page.
  test.each(GUARDED_ROUTES)("%s declares no page-wide reason state", (file) => {
    const source = read(file);
    expect(source).not.toContain("const [reason, setReason]");
    expect(source).not.toContain("reasonTooShort");
  });

  test.each(GUARDED_ROUTES)("%s holds its arming state in the shared machine", (file) => {
    const source = read(file);
    expect(source).toContain("destructiveActionReducer");
    expect(source).toContain("IDLE_DESTRUCTIVE_ACTION");
  });
});

describe("every destructive trigger goes through the confirm step", () => {
  test("no destructive mutation is wired straight to a click handler", () => {
    for (const file of GUARDED_ROUTES) {
      const source = read(file);
      // The old shape: `onClick={() => void revokeAssignment(id)}`.
      expect(source).not.toMatch(/onClick=\{\(\) => void (transition|revokeAssignment|mutate)\(/);
    }
  });

  test.each(GUARDED_ROUTES)("%s renders each action through the confirm component", (file) => {
    const source = read(file);
    const uses = source.match(/<AdminDestructiveAction\b/g) ?? [];
    expect(uses.length).toBeGreaterThan(0);

    // Every action names the object, the act and the consequence -- in the
    // confirm step, not only on the resting trigger.
    for (const prop of [
      "actionKey=",
      "confirmPrompt=",
      "confirmLabel=",
      "triggerLabel=",
      "onConfirm=",
    ]) {
      expect({ prop, count: source.split(prop).length - 1 }).toEqual({
        prop,
        count: uses.length,
      });
    }
  });
});

describe("every confirm step is keyed by the object it acts on", () => {
  // Requirement 3 at the call site: the reducer guarantees one motive per key,
  // so the keys themselves must be distinct per row. A key of "reject" alone
  // would reintroduce the defect across rows while the reducer stayed correct.
  test("approvals key every decision by the approval id", () => {
    const source = read("admin.approvals.tsx");
    expect(source).toContain(
      "const key = (operation: string) => `${operation}:${item.approvalId}`",
    );
    const keys = [...source.matchAll(/actionKey=\{([^}]*)\}/g)].map((match) => match[1].trim());
    expect(keys.length).toBeGreaterThan(0);
    for (const value of keys) {
      expect(value).toMatch(/^key\("(approve|reject|cancel|execute)"\)$/);
    }
  });

  test("a per-assignment revocation is keyed by the assignment id", () => {
    const source = read("admin.staff.$principalId.tsx");
    expect(source).toContain("actionKey={`revoke-assignment:${assignment.assignmentId}`}");
  });

  test("the principal-wide operations are keyed apart from one another", () => {
    const source = read("admin.staff.$principalId.tsx");
    const keys = [...source.matchAll(/actionKey="([^"]*)"/g)].map((match) => match[1]);
    expect(keys).toEqual(["principal:suspend", "principal:restore", "principal:emergency"]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("the confirm step is bilingual and direction-neutral", () => {
  const surfaces = [COMPONENT, ...GUARDED_ROUTES];

  test.each(surfaces)("%s uses logical utilities only", (file) => {
    const used = classNames(read(file));
    // Physical horizontal utilities lay out backwards in Arabic RTL.
    expect(used).not.toMatch(
      /(^|[\s])(ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|text-left|text-right)-/,
    );
  });

  test.each(surfaces)("%s spaces letters under ltr: only", (file) => {
    // Arabic letterforms join; pulling them apart breaks the script.
    for (const match of classNames(read(file)).matchAll(/(\S*)tracking-/g)) {
      expect({ file, prefix: match[1] }).toEqual({ file, prefix: "ltr:" });
    }
  });

  test("the confirm step ships French and Arabic for every generic string", () => {
    const source = read(COMPONENT);
    for (const [fr, ar] of [
      ["Motif (requis)", "السبب (مطلوب)"],
      ["Abandonner", "تراجع"],
      ["Opération en cours…", "جارٍ التنفيذ…"],
    ]) {
      expect(source).toContain(fr);
      expect(source).toContain(ar);
    }
  });

  test("backing out is never worded like the destructive 'Annuler' action", () => {
    // On the approvals queue, "Annuler"/"إلغاء" is the name of a destructive
    // decision of its own. The escape hatch must not borrow that word.
    const rendered = code(read(COMPONENT));
    expect(rendered).toContain('rtl ? "تراجع" : "Abandonner"');
    expect(rendered).not.toContain('"Annuler"');
    expect(rendered).not.toContain('"إلغاء"');
  });

  test("every control in the confirm step meets the 44px touch floor", () => {
    // The routes no longer style destructive controls themselves -- they
    // delegate to this component, which composes the shared control classes.
    const helpers = readFileSync(
      join(import.meta.dir, "../backend/admin/functional-route-helpers.ts"),
      "utf8",
    );
    for (const name of ["adminButtonClass", "adminDangerButtonClass", "adminFieldClass"]) {
      const start = helpers.indexOf(`export const ${name}`);
      expect({ name, found: start !== -1 }).toEqual({ name, found: true });
      const declaration = helpers.slice(start, helpers.indexOf(";", start));
      expect({ name, floor: declaration.includes("min-h-11") }).toEqual({ name, floor: true });
    }
    // The one control the confirm step styles for itself: "Abandonner".
    expect(classNames(read(COMPONENT))).toContain("min-h-11");
  });
});

describe("existing browser hooks survive the rework", () => {
  // Playwright specs and the frozen console contract address these by name.
  test.each([
    ["admin.staff.$principalId.tsx", "admin-emergency-revocation"],
    ["admin.staff.$principalId.tsx", "admin-assignment"],
    ["admin.staff.$principalId.tsx", "admin-assignment-history"],
    ["admin.staff.$principalId.tsx", "admin-staff-detail-message"],
    ["admin.approvals.tsx", "admin-approval-detail"],
    ["admin.approvals.tsx", "admin-approvals-message"],
    ["admin.approvals.tsx", "admin-approvals-empty"],
  ])("%s still exposes %s", (file, testId) => {
    expect(read(file)).toContain(testId);
  });
});

describe("server-side authorization is untouched by this UI change", () => {
  test("the confirm component knows nothing about permissions or repositories", () => {
    const source = read(COMPONENT);
    for (const forbidden of ["Repository", "adminRepositoryContext", "permission", "idempotency"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  test.each(GUARDED_ROUTES)("%s still mints an idempotency key per call", (file) => {
    expect(read(file)).toContain("crypto.randomUUID()");
  });
});
