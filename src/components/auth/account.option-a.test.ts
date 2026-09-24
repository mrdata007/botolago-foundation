import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Option A — the account family: the auth screens (Decision 7, the light
 * register), Profile (A-Profile) and the OAuth consent page.
 *
 * Source-level pins, like `shell.option-a.test.tsx`, so a later edit cannot
 * quietly walk a decision back: the auth screens off the dark mesh, every
 * field in the sheet's filled look, the code slots on the kit and left to
 * right, Profile's club colour coming from the palette, and the consent
 * route kept off `AuthShell` (see the note on that test).
 */

const ROOT = join(import.meta.dir, "..", "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
/** Source without comments, so a note that NAMES a retired class cannot trip a rule. */
const code = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("AuthShell — the light register (Decision 7)", () => {
  const shell = code("src/components/auth/AuthShell.tsx");

  it("stands on the flat page, no longer on the dark mesh", () => {
    expect(shell).toContain('<PageBackground variant="neutral" />');
    expect(shell).not.toContain('variant="auth"');
    expect(shell).not.toContain("mesh-auth");
  });

  it("keeps the band in the mesh register, with the back control and the language switcher", () => {
    expect(shell).toContain("ui.tone.onMesh");
    expect(shell).toContain('useBackTo("/")');
    expect(shell).toMatch(/<UiBackButton[^>]*tone="glass"/);
    expect(shell).toContain('<LanguageSwitcher tone="onMesh" />');
  });

  it("puts the heading and the form on a white sheet with the sheet radius", () => {
    expect(shell).toContain("rounded-t-[var(--ui-radius-sheet)]");
    expect(shell).toContain("ui.surface.bar");
    expect(shell).toMatch(/<h1 className=\{cn\([^)]*ui\.display\.title/);
    // No card inside the sheet: the form sits on it directly.
    expect(shell).not.toContain("<UiCard");
  });

  it("paints the colour strip through the club palette; the only hexes are Google's mark", () => {
    expect(shell).toContain("clubStyle(club)");
    const beforeGoogle = shell.slice(0, shell.indexOf("export function GoogleGlyph"));
    expect(beforeGoogle).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(beforeGoogle).not.toMatch(/\brgba?\(/);
  });

  it("exports components only; the class recipes live in auth-classes", () => {
    expect(shell).not.toMatch(/export (const|function) auth[A-Z]/);
  });
});

describe("the auth forms", () => {
  it.each([
    "auth.login.tsx",
    "auth.register.tsx",
    "auth.forgot-password.tsx",
    "auth.update-password.tsx",
    "auth.profile-setup.tsx",
  ])("%s draws every field in the sheet's filled look", (file) => {
    const source = code(`src/routes/${file}`);
    const inputs = source.match(/<UiInput\b/g)?.length ?? 0;
    expect(inputs).toBeGreaterThan(0);
    expect(source.match(/fieldClassName=\{authFieldClass\(/g)?.length ?? 0).toBe(inputs);
  });

  it.each(["auth.verify.tsx", "auth.mfa-challenge.tsx", "profile.security.tsx"])(
    "%s puts the six code slots on the kit, left to right",
    (file) => {
      const source = code(`src/routes/${file}`);
      expect(
        source.match(/<InputOTPSlot index=\{\d\} className=\{authOtpSlotClass\} \/>/g),
      ).toHaveLength(6);
      // A code reads first digit to last in Arabic too.
      expect(source).toContain('<div dir="ltr">');
    },
  );

  it("moves 'forgot password' under its field, onto the field's own label", () => {
    const login = code("src/routes/auth.login.tsx");
    expect(login).not.toContain("htmlFor={passwordId}");
    expect(login).toMatch(/id=\{passwordId\}\s+label=\{t\("auth\.password"\)\}/);
  });
});

describe("the OAuth consent route", () => {
  it("is not built on AuthShell", () => {
    // The route is `ssr: false` and redirects a signed-out reader to
    // `/auth/login` from `beforeLoad` while it hydrates. When it imported the
    // shell, the login screen's modules were already loaded by then, the lazy
    // login component rendered at once into the server's empty shell, and
    // React logged a hydration mismatch on every visit (6/6 in a browser;
    // 0/6 without the import). The consent page is a kit card instead.
    const consent = read("src/routes/[.]lovable.oauth.consent.tsx");
    expect(consent).toContain("ssr: false");
    expect(consent).not.toContain('from "@/components/auth/AuthShell"');
  });

  it("speaks the reader's language instead of English literals", () => {
    const consent = code("src/routes/[.]lovable.oauth.consent.tsx");
    // The needles name the keys without the call around them: the i18n gate
    // reads every translation-call shape in src/ as a call site, tests too.
    for (const key of ["title", "body", "approve", "deny", "error_title"]) {
      expect(consent).toContain(`"auth.consent.${key}"`);
    }
    expect(consent).not.toMatch(/>\s*(Approve|Deny)\s*</);
    expect(consent).not.toContain("cta-brand");
  });
});

describe("Profile (A-Profile)", () => {
  const profile = code("src/routes/profile.tsx");

  it("carries its title in the hub band", () => {
    expect(profile).toMatch(/pageHeader=\{<UiPageTitle title=\{t\("profile\.title"\)\} \/>\}/);
  });

  it("colours the identity card from the club palette, never from the data's primaryColor", () => {
    expect(profile).toContain("{...clubStyle(club ?? null)}");
    expect(profile).toContain("ui.club.fill");
    expect(profile).toContain("ui.club.stripes");
    expect(profile).not.toContain("primaryColor");
    expect(profile).not.toContain("profile-cover");
  });

  it("isolates the username and the e-mail left to right, so '@' stays in front in Arabic", () => {
    expect(profile).toContain('<bdi dir="ltr">@{user.username}</bdi>');
    expect(profile).toContain('<bdi dir="ltr">{user.email}</bdi>');
  });

  it("draws 'Mes clubs' from the followed clubs only, with logical edges and a centred badge", () => {
    expect(profile).toContain("profileClubs(favoriteClub, followed)");
    expect(profile).toContain("ui.edge.blockEnd");
    expect(profile).toContain("inset-x-0 top-2 mx-auto w-fit");
    expect(profile).not.toMatch(/left-1\/2|translate-x/);
  });
});
