import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { dictionaries } from "@/i18n/dictionaries";

/**
 * Audit 2026-10-14, LOC-06: the Profile "Langue" row changes the language of
 * the app on this device only (browser storage). Notifications use the
 * language saved on the ACCOUNT (`profiles.preferred_language`, which the
 * e-mail and push fanouts read), set at sign-up and whenever the profile
 * editor is saved (its language step starts from the device's language). Nothing on the row said so, so a reader who switched to
 * Arabic could expect Arabic notifications.
 *
 * The screens need a router and a session to render, so these pin the
 * wording and, as important, the facts the wording states: a sentence that
 * says "the language of your account" is only true while an account language
 * is settable somewhere and the row does not write it.
 */
const root = join(import.meta.dir, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const strip = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const { fr, ar } = dictionaries;

describe("profile language control: wording", () => {
  it("names the row for the device, in both languages", () => {
    expect(fr["profile.language.device"]).toBe("Langue sur cet appareil");
    expect(ar["profile.language.device"]).toBe("اللغة على هذا الجهاز");
  });

  it("says what the row changes and what notifications follow", () => {
    expect(fr["profile.language.help"]).toBe(
      "Ce choix change l’application sur cet appareil. Les notifications utilisent la langue de votre compte.",
    );
    expect(ar["profile.language.help"]).toBe(
      "يغيّر هذا الاختيار لغة التطبيق على هذا الجهاز. تستخدم الإشعارات اللغة المحفوظة في حسابك.",
    );
  });

  it("does not mention an account to a visitor who has none", () => {
    expect(fr["profile.language.help_guest"]).toBe(
      "Ce choix change l’application sur cet appareil.",
    );
    expect(fr["profile.language.help_guest"]).not.toMatch(/compte/);
    expect(ar["profile.language.help_guest"]).not.toContain("حساب");
  });

  it("the editor's language step does not claim to show the account's current language", () => {
    // It starts from the device's language, so its label is neutral and its
    // hint states what SAVING does, not what is currently stored.
    expect(fr["auth.setup.language_confirm"]).toBe("Langue");
    expect(ar["auth.setup.language_confirm"]).toBe("اللغة");
    expect(fr["auth.setup.language_hint"]).toBe(
      "En enregistrant, cette langue devient celle de vos notifications et de l’application sur cet appareil.",
    );
    expect(ar["auth.setup.language_hint"]).toBe(
      "عند الحفظ تصبح هذه اللغة لغة إشعاراتك ولغة التطبيق على هذا الجهاز.",
    );
    expect(fr["auth.setup.language_confirm"]).not.toMatch(/notification/i);
    expect(ar["auth.setup.language_confirm"]).not.toContain("إشعار");
  });
});

describe("profile language control: the wording is true", () => {
  const profile = strip(read("src/routes/profile.tsx"));
  const choices = strip(read("src/components/shell/LanguageMenuChoices.tsx"));
  const setup = strip(read("src/routes/auth.profile-setup.tsx"));

  it("the row only changes the device's language, never the account's", () => {
    expect(choices).toContain("setLanguage(");
    expect(choices).not.toMatch(/completeProfile|updateProfile|preferred_?[Ll]anguage|authService/);
  });

  it("the row is named for the device and says what it does", () => {
    const row = profile.slice(
      profile.indexOf("function LanguageRow"),
      profile.indexOf("function ThemeRow"),
    );
    expect(row).toContain('t("profile.language.device")');
    expect(row).not.toContain('t("language.switch")');
    expect(row).toContain("aria-describedby={helpId}");
    expect(row).toContain('t("profile.language.help")');
    expect(row).toContain('t("profile.language.help_guest")');
  });

  it("only a signed-in reader is told about the account", () => {
    expect(profile).toContain("<LanguageRow signedIn />");
    // The signed-out visitor's preferences (`DevicePreferences`) use the guest line.
    const guest = profile.slice(profile.indexOf("function DevicePreferences"));
    expect(guest).toContain("<LanguageRow signedIn={false} />");
  });

  it("an account language really is settable, and saved with the profile", () => {
    // The sentence points at "the language of your account": that is this
    // choice, saved as the account's preferred language when the editor ends.
    expect(setup).toContain('id="setupLanguage"');
    expect(setup).toContain('t("auth.setup.language_confirm")');
    expect(setup).toMatch(/language: chosenLang/);
    expect(setup).toContain('t("auth.setup.language_hint")');
    // The coupling the hint describes: the step starts from the DEVICE's
    // language, and saving sets the device's language to the chosen one.
    expect(setup).toMatch(/setChosenLang\(lang\)/);
    expect(setup).toMatch(/if \(chosenLang !== lang\) setLanguage\(chosenLang\)/);
  });

  it("the profile reaches that editor from its Notifications row", () => {
    expect(profile).toMatch(/to="\/auth\/profile-setup"[\s\S]{0,200}step: 3/);
  });
});
