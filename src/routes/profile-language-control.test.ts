import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { dictionaries } from "@/i18n/dictionaries";

/**
 * Audit 2026-10-14, LOC-06: the Profile "Langue" row changes the language of
 * the app on this device only (browser storage). Notifications use the
 * language saved on the ACCOUNT (`profiles.preferred_language`, which the
 * e-mail and push fanouts read): French for a new account (owner decision,
 * 2026-10-15) and changed only by the language step of the profile editor,
 * which shows the stored value. Nothing on the row said so, so a reader who switched to
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

  it("limits the choice to this device and points to notification language settings", () => {
    expect(fr["profile.language.help"]).toBe(
      "Ce choix s’applique à cet appareil. Pour la langue des alertes et e-mails, ouvrez Notifications.",
    );
    expect(ar["profile.language.help"]).toBe(
      "هذا الاختيار يخص هذا الجهاز. لتغيير لغة التنبيهات ورسائل البريد، افتح الإشعارات.",
    );
  });

  it("does not mention an account to a visitor who has none", () => {
    expect(fr["profile.language.help_guest"]).toBe(
      "Ce choix change l’application sur cet appareil.",
    );
    expect(fr["profile.language.help_guest"]).not.toMatch(/compte/);
    expect(ar["profile.language.help_guest"]).not.toContain("حساب");
  });

  it("the editor's language step is named for notifications and says French is the default", () => {
    // It shows the account's stored value (French for a new account), so the
    // label may name the notifications, and the hint says what the step does
    // NOT do: change the app on this device.
    expect(fr["auth.setup.language_confirm"]).toBe("Langue des notifications");
    expect(ar["auth.setup.language_confirm"]).toBe("لغة الإشعارات");
    expect(fr["auth.setup.language_hint"]).toBe(
      "Langue de vos e-mails, alertes et notifications. Le français est la langue par défaut. La langue de l’application sur cet appareil se règle depuis Profil.",
    );
    expect(ar["auth.setup.language_hint"]).toBe(
      "لغة رسائل البريد الإلكتروني والتنبيهات والإشعارات. الفرنسية هي اللغة الافتراضية. تُضبط لغة التطبيق على هذا الجهاز من الملف الشخصي.",
    );
    // The old hint promised the opposite: that saving also switched the app.
    expect(fr["auth.setup.language_hint"]).not.toMatch(/devient celle/);
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
    expect(setup).toMatch(/language: notificationLanguageToSave\(user\?\.language, pickedLang\)/);
    expect(setup).toContain('t("auth.setup.language_hint")');
  });

  it("the step is seeded from the stored account language, never from the device's", () => {
    // Owner decision 2026-10-15: French by default, the stored value wins. The
    // device language (`lang`) must not seed, follow or be written by the step.
    expect(setup).toMatch(/shownNotificationLanguage\(user\?\.language, pickedLang\)/);
    expect(setup).not.toMatch(/setChosenLang|useState<Language>\(lang\)/);
    expect(setup).not.toMatch(/setLanguage/);
    expect(setup).not.toMatch(/language: chosenLang/);
  });

  it("the chips wait for the account, and a refused save shows the connection message", () => {
    expect(setup).toContain("disabled={!user}");
    expect(setup).toMatch(/res\.errorCode === "network"\s*\?\s*"auth\.error\.network"/);
  });

  it("sign-up does not send the device's language as the notification language", () => {
    const register = strip(read("src/routes/auth.register.tsx"));
    expect(register).not.toMatch(/language: lang/);
    expect(register).not.toMatch(/const \{[^}]*\blang\b[^}]*\} = useI18n/);
  });

  it("the profile reaches that editor from its Notifications row", () => {
    expect(profile).toMatch(/to="\/auth\/profile-setup"[\s\S]{0,200}step: 3/);
  });
});
