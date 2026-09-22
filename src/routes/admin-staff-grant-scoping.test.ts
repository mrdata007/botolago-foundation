import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Launch P1 — a motive typed on /admin/staff must not arm a privilege grant.
 *
 * `admin-destructive-safety.test.ts` locks the same property for the
 * *destructive* Admin routes. This file locks it for the one route where the
 * mistake escalates privilege instead of removing it.
 *
 * The defect: `admin.staff.tsx` held a single page-level
 * `const [reason, setReason] = useState("")`, bound to two separate inputs and
 * read by three mutations — `createStaffPrincipal`, `assignStandardRole` and
 * `requestPlatformAdmin`. Eight characters typed into "Motif de création"
 * enabled "Affecter le rôle standard" and "Demander platform_admin" at the same
 * time, so one stray tap granted a role — or opened a request for the highest
 * privilege level on the platform — with a motive written about something else
 * entirely, and with that motive in the audit trail.
 *
 * A source-shape check rather than a render test: this repository has no DOM
 * test setup, and the wiring is exactly what must not regress. It follows
 * `admin-destructive-safety.test.ts`, which locks the same class of wiring.
 */

const ROUTE = "admin.staff.tsx";

function read(relativePath: string): string {
  return readFileSync(join(import.meta.dir, relativePath), "utf8");
}

/** Source with comments removed, for checks about what actually renders. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** Every value of a `className` attribute, so prose in comments is not scanned. */
function classNames(source: string): string {
  const matches = source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{([^}]*)\})/g);
  return [...matches].map((match) => match[1] ?? match[2] ?? match[3] ?? "").join(" ");
}

/** The `actionKey={...}` expressions the route renders, as written. */
function actionKeys(source: string): string[] {
  return [...source.matchAll(/actionKey=\{`([^`]*)`\}/g)].map((match) => match[1]);
}

/** The three mutations that a shared motive used to arm all at once. */
const GRANTING_MUTATIONS = ["createPrincipal", "assignRole", "requestPlatformAdmin"] as const;

describe("the staff console keeps no page-level motive", () => {
  test("no page-wide reason state is declared", () => {
    const source = read(ROUTE);
    // The defect itself. If this string comes back, so does the bug.
    expect(source).not.toContain("const [reason, setReason]");
    expect(source).not.toContain("setReason(");
    expect(source).not.toContain("reasonTooShort");
  });

  test("no motive input is rendered by the route itself", () => {
    // A second motive field on the page is a second way to arm something the
    // operator was not looking at. The only motive field lives inside the
    // confirm step of the action it belongs to.
    const rendered = code(read(ROUTE));
    expect(rendered).not.toContain("minLength=");
    expect(rendered).not.toMatch(/value=\{reason\}/);
  });

  test("arming state is held in the shared machine, not in the page", () => {
    const source = read(ROUTE);
    expect(source).toContain("destructiveActionReducer");
    expect(source).toContain("IDLE_DESTRUCTIVE_ACTION");
    expect(source).toContain("useReducer(destructiveActionReducer, IDLE_DESTRUCTIVE_ACTION)");
  });

  test("the motive each mutation sends is the one its confirm step collected", () => {
    const rendered = code(read(ROUTE));
    for (const mutation of GRANTING_MUTATIONS) {
      // Takes the motive as an argument -- it cannot read a page-level one.
      expect({
        mutation,
        declared: rendered.includes(`const ${mutation} = async (reason: string)`),
      }).toEqual({ mutation, declared: true });
      // And is reached only through a confirm step's onConfirm.
      expect(rendered).toContain(`onConfirm={(reason) => ${mutation}(reason)}`);
    }
  });
});

describe("every grant goes through a confirm step of its own", () => {
  test("no granting mutation is wired straight to a click handler", () => {
    const rendered = code(read(ROUTE));
    // The old shape: `onClick={() => void assignRole()}` / `onClick={createPrincipal}`.
    for (const mutation of GRANTING_MUTATIONS) {
      expect(rendered).not.toMatch(new RegExp(`onClick=\\{(\\(\\) => void )?${mutation}\\b`));
    }
  });

  test("all three actions render through the shared confirm component", () => {
    const source = read(ROUTE);
    const uses = source.match(/<AdminDestructiveAction\b/g) ?? [];
    expect(uses.length).toBe(3);

    for (const prop of [
      "actionKey=",
      "confirmPrompt=",
      "confirmLabel=",
      "triggerLabel=",
      "onConfirm=",
    ]) {
      expect({ prop, count: source.split(prop).length - 1 }).toEqual({ prop, count: uses.length });
    }

    // Consequential, not destructive: these three create access, they do not
    // remove it, so they must not borrow the rose "danger" trigger.
    expect(source.split('tone="primary"').length - 1).toBe(uses.length);
    expect(source).not.toContain('tone="danger"');
  });

  test("the whole page shares one arming machine, so only one action is armed", () => {
    const source = read(ROUTE);
    expect(source.split("state={action}").length - 1).toBe(3);
    expect(source.split("dispatch={dispatch}").length - 1).toBe(3);
  });
});

describe("every action key carries the object it acts on", () => {
  // The reducer guarantees one motive per key. That guarantee is only worth
  // anything if the keys are distinct per object: a bare "assign-role" would
  // let a motive typed about one resolved account arm the same grant for the
  // next account the operator looks up.
  test("each key names its operation and the resolved auth user", () => {
    const keys = actionKeys(read(ROUTE));
    expect(keys.length).toBe(3);
    for (const key of keys) {
      expect({ key, carriesObject: key.includes("${result.authUserId}") }).toEqual({
        key,
        carriesObject: true,
      });
    }
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("the keys are exactly the three operations this page performs", () => {
    expect(actionKeys(read(ROUTE))).toEqual([
      "create-principal:${result.authUserId}",
      "assign-role:${result.authUserId}:${role}",
      "request-platform-admin:${result.authUserId}",
    ]);
  });

  test("the role grant is keyed by the role too", () => {
    // `role` is chosen in a select that sits outside the confirm step. Without
    // it in the key, a motive written while `editor` was selected would stay
    // armed after the operator switched the select to `security_admin`.
    const keys = actionKeys(read(ROUTE));
    const assign = keys.find((key) => key.startsWith("assign-role:"));
    expect(assign).toContain("${role}");
  });

  test("can fail: a key without its object is rejected by this check", () => {
    // Negative control. If this ever passes, the assertion above is worthless.
    const keys = ["assign-role", "request-platform-admin"];
    expect(keys.every((key) => key.includes("${result.authUserId}"))).toBe(false);
  });
});

describe("each confirm step names what will happen, in both languages", () => {
  const source = read(ROUTE);

  test.each([
    ["Confirmer la création", "تأكيد الإنشاء"],
    ["Confirmer l’affectation", "تأكيد منح الدور"],
    ["Confirmer la demande", "تأكيد الطلب"],
    ["Créer l’identité staff de ", "إنشاء هوية الطاقم لـ "],
    ["Affecter le rôle ", "منح الدور "],
    ["Demander le rôle ", "طلب دور "],
  ])("%s is shipped with its Arabic counterpart", (fr, ar) => {
    expect(source).toContain(fr);
    expect(source).toContain(ar);
  });

  test("the platform_admin request says plainly that it is the highest privilege", () => {
    expect(source).toContain("le niveau de privilège le plus élevé de la plateforme");
    expect(source).toContain("أعلى مستوى صلاحيات في المنصة");
    // And that it does not grant on its own: it opens a dual-control approval.
    expect(source).toContain("double contrôle");
    expect(source).toContain("تحكم مزدوج");
  });

  test("the role grant names the role and the account it lands on", () => {
    const rendered = code(source);
    expect(rendered).toMatch(
      /Affecter le rôle [\s\S]{0,400}\{role\}[\s\S]{0,400}\{result\.maskedEmail\}/,
    );
  });
});

describe("the staff console stays direction-neutral", () => {
  test("logical utilities only", () => {
    expect(classNames(read(ROUTE))).not.toMatch(
      /(^|[\s])(ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|text-left|text-right)-/,
    );
  });

  test("letters are spaced under ltr: only", () => {
    for (const match of classNames(read(ROUTE)).matchAll(/(\S*)tracking-/g)) {
      expect(match[1]).toBe("ltr:");
    }
  });

  test("LTR data inside a bilingual sentence is wrapped in AdminDatum", () => {
    const rendered = code(read(ROUTE));
    // The role slug, the platform_admin slug and the masked address all sit
    // inside Arabic prose in the confirm prompts.
    expect(rendered).toMatch(/<AdminDatum[^>]*>\s*\{role\}\s*<\/AdminDatum>/);
    expect(rendered).toMatch(/<AdminDatum[^>]*>\s*platform_admin\s*<\/AdminDatum>/);
    expect(rendered).toMatch(/<AdminDatum[^>]*>\s*\{result\.maskedEmail\}\s*<\/AdminDatum>/);
  });

  test("controls the route still styles itself meet the 44px touch floor", () => {
    // The 44px floor used to be a literal `min-h-11` written into this
    // route's own class strings. It is not any more, and the floor is not
    // weaker for it: every control here is a kit primitive, and the ui-kit
    // contract test asserts each button size states its height from
    // `--ui-tap-min` or `--ui-row-min`.
    //
    // So this checks the property that now carries the floor — the controls
    // come from the kit — rather than a literal that would have to be kept
    // alive purely to keep one assertion green. It fails if someone hand-rolls
    // a bare `<button>` or bare `<a>`, which is the only way to get a control
    // in here that no floor applies to.
    const source = read(ROUTE);
    const handRolled = [
      ...[...source.matchAll(/<button\b[\s\S]*?>/g)].map((m) => m[0]),
      ...[...source.matchAll(/<a\s[\s\S]*?>/g)].map((m) => m[0]),
    ].filter(
      (tag) => !/min-h-11|min-h-\[var\(--ui-(tap|row)-min\)\]|ui\.space\.(tap|row)/.test(tag),
    );
    const usesKitControls = /\bUi(Link)?Button\b/.test(source);
    expect({ handRolled, usesKitControls }).toEqual({ handRolled: [], usesKitControls: true });
  });
});

describe("existing browser hooks survive the rework", () => {
  test.each([
    "admin-staff-list",
    "admin-user-eligibility",
    "admin-staff-message",
    "admin-staff-unresolved",
    "admin-staff-result",
    "admin-create-principal",
    "admin-role-assignment",
    "admin-assign-role",
    "admin-platform-request",
    "admin-request-platform-admin",
  ])("%s is still exposed", (testId) => {
    expect(read(ROUTE)).toContain(testId);
  });
});

describe("server-side authorization is untouched by this UI change", () => {
  const rendered = code(read(ROUTE));

  test("the server's motive floor is unchanged and still only mirrored", () => {
    expect(rendered).toContain("const MINIMUM_REASON_LENGTH = 8");
    expect(rendered.split("minimumReasonLength={MINIMUM_REASON_LENGTH}").length - 1).toBe(3);
  });

  test("each call still sends the same arguments and a fresh idempotency key", () => {
    expect(rendered).toMatch(
      /createStaffPrincipal\(\s*result\.authUserId,\s*reason,\s*crypto\.randomUUID\(\),\s*adminRepositoryContext\(access\),/,
    );
    expect(rendered).toMatch(
      /assignStandardRole\(\s*\{\s*targetAuthUserId: result\.authUserId,\s*role,[\s\S]*?reason,\s*reference: "admin-security-operations",\s*idempotencyKey: crypto\.randomUUID\(\),/,
    );
    expect(rendered).toMatch(
      /requestPlatformAdmin\(\s*\{\s*targetAuthUserId: result\.authUserId,[\s\S]*?reason,\s*idempotencyKey: crypto\.randomUUID\(\),/,
    );
    expect(rendered.split("crypto.randomUUID()").length - 1).toBe(3);
  });

  test("the route still refuses to act when the loader did not authorize", () => {
    expect(rendered.split('access.state !== "authorized"').length - 1).toBe(4);
  });
});
