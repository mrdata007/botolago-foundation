import { describe, expect, test } from "bun:test";

import {
  PREMIUM_STATES,
  BILLING_EVENT_TYPES,
  BILLING_OUTCOMES,
  PREMIUM_MODES,
  PREMIUM_SOURCES,
} from "@/backend/premium/admin";

import {
  EVENT_TYPE_LABELS,
  formatPrice,
  formatProductPrice,
  grantWhereToLook,
  MODE_BANNERS,
  MODE_HINTS,
  MODE_LABELS,
  OUTCOME_LABELS,
  premiumAdminErrorMessage,
  needsReconnect,
  productName,
  recordedStateLabel,
  subscriberCount,
  renewalLabel,
  SOURCE_LABELS,
  STATE_HINTS,
  STATE_LABELS,
  STATE_NAMES,
} from "./plus-presentation";

const monthly = {
  code: "plus_monthly",
  periodMonths: 1,
  renews: true,
  priceMinor: 2000,
  currency: "MAD",
  active: true,
};
const yearly = {
  ...monthly,
  code: "plus_yearly",
  periodMonths: 12,
  renews: false,
  priceMinor: 20000,
};

describe("prices come from the amount the API returned", () => {
  test("20 MAD a month and 200 MAD a year, in both languages", () => {
    expect(formatProductPrice(monthly, "fr")).toBe("20 MAD / mois");
    expect(formatProductPrice(yearly, "fr")).toBe("200 MAD / an");
    expect(formatProductPrice(monthly, "ar")).toContain("20");
    expect(formatProductPrice(monthly, "ar")).toContain("MAD");
    expect(formatProductPrice(yearly, "ar")).toContain("200");
  });
  test("a changed price shows as changed, with centimes only when it has some", () => {
    expect(formatProductPrice({ ...monthly, priceMinor: 2500 }, "fr")).toBe("25 MAD / mois");
    expect(formatPrice(1950, "MAD", "fr")).toBe("19,50 MAD");
    expect(formatProductPrice({ ...monthly, priceMinor: 3000 }, "fr")).not.toContain("20");
  });
  test("an unusual period is stated, not guessed", () => {
    expect(formatProductPrice({ ...monthly, periodMonths: 3 }, "fr")).toBe("20 MAD / 3 mois");
  });
  test("renewal is read from the data", () => {
    expect(renewalLabel(monthly, "fr")).toContain("automatique");
    expect(renewalLabel(yearly, "fr")).toContain("sans renouvellement");
  });
  test("an unknown product reads « Autre formule », never its code", () => {
    expect(productName("plus_monthly", "fr")).toBe("Mensuel");
    expect(productName("plus_yearly", "ar")).toBe("سنوي");
    expect(productName("plus_season", "fr")).toBe("Autre formule");
    expect(productName("plus_season", "ar")).not.toContain("plus_season");
  });
});

describe("every value the contract allows has words in both languages", () => {
  const tables: [string, readonly string[], Record<string, Record<"fr" | "ar", string>>][] = [
    ["states", PREMIUM_STATES, STATE_LABELS],
    ["state names", PREMIUM_STATES, STATE_NAMES],
    ["state hints", PREMIUM_STATES, STATE_HINTS],
    ["sources", PREMIUM_SOURCES, SOURCE_LABELS],
    ["modes", PREMIUM_MODES, MODE_LABELS],
    ["mode hints", PREMIUM_MODES, MODE_HINTS],
    ["event types", BILLING_EVENT_TYPES, EVENT_TYPE_LABELS],
    ["outcomes", BILLING_OUTCOMES, OUTCOME_LABELS],
  ];
  for (const [name, keys, table] of tables) {
    test(name, () => {
      expect(Object.keys(table).sort()).toEqual([...keys].sort());
      for (const key of keys) {
        expect(table[key].fr.length).toBeGreaterThan(0);
        expect(table[key].ar.length).toBeGreaterThan(0);
        expect(/[؀-ۿ]/.test(table[key].ar) || /^[A-Za-z ]+$/.test(table[key].ar)).toBe(true);
      }
    });
  }
});

describe("recorded states and error sentences", () => {
  test("none and null are words, a known state is its name", () => {
    expect(recordedStateLabel(null, "fr")).toBe("—");
    expect(recordedStateLabel("none", "fr")).toBe("aucune");
    expect(recordedStateLabel("cancelling", "fr")).toBe("En résiliation");
    expect(recordedStateLabel("mystery", "fr")).toBe("mystery");
  });
  test("a refusal reads as a sentence in each language, and an unknown one still names itself", () => {
    expect(premiumAdminErrorMessage("premium_reason_invalid", "fr")).toContain("8 et 500");
    expect(premiumAdminErrorMessage("premium_reason_invalid", "ar")).toContain("500");
    expect(premiumAdminErrorMessage("recent_auth_required", "fr")).toContain("15 minutes");
    expect(premiumAdminErrorMessage("premium_grant_already_revoked", "fr")).toContain("déjà");
    expect(premiumAdminErrorMessage("something_new", "fr")).toContain("something_new");
  });
});

describe("an e-mail lookup without the user directory permission", () => {
  test("says why, and points to the account id, in both languages", () => {
    expect(premiumAdminErrorMessage("premium_lookup_email_not_allowed", "fr")).toContain(
      "identifiant du compte",
    );
    expect(premiumAdminErrorMessage("premium_lookup_email_not_allowed", "ar")).toContain(
      "معرّف الحساب",
    );
  });
});

describe("the mode banner", () => {
  test("has a sentence per mode and language, opening with the mode's own name", () => {
    for (const mode of PREMIUM_MODES) {
      for (const lang of ["fr", "ar"] as const) {
        const text = MODE_BANNERS[mode].text[lang];
        expect(text.startsWith(MODE_LABELS[mode][lang])).toBe(true);
      }
    }
    expect(MODE_BANNERS.off.text.fr).toContain("même avec une offre du personnel");
    expect(MODE_BANNERS.preview.text.fr).toContain(
      "seuls les abonnés le voient (offre du personnel ou achat de test)",
    );
  });
});

describe("plain language for staff", () => {
  test("no error sentence carries a migration number", () => {
    const codes = [
      "premium_admin_unavailable",
      "premium_admin_invalid_answer",
      "premium_account_not_found",
      "recent_auth_required",
      "premium_lookup_invalid",
    ];
    for (const code of codes)
      for (const lang of ["fr", "ar"] as const)
        expect(premiumAdminErrorMessage(code, lang)).not.toMatch(/\d{8,}|migration|الترحيل/i);
  });

  test("only a stale sign-in offers « Se reconnecter »", () => {
    expect(needsReconnect("recent_auth_required")).toBe(true);
    expect(needsReconnect("premium_reason_invalid")).toBe(false);
  });

  test("the subscriber count is the accounts that are members through a subscription", () => {
    const overview = {
      membersByState: { active: 10, cancelling: 2, grace: 1, on_hold: 4, expired: 9 },
      liveGrants: 3,
    } as never;
    expect(subscriberCount(overview)).toBe(13);
  });

  test("the where-to-look line is for the own account or another, and warns when off", () => {
    expect(grantWhereToLook(true, "on", "fr").lead).toContain("votre carte");
    expect(grantWhereToLook(false, "on", "fr").lead).toContain("Connectez-vous avec ce compte");
    expect(grantWhereToLook(false, "on", "fr").off).toBeNull();
    expect(grantWhereToLook(false, "off", "fr").off).toContain("Éteint");
    expect(grantWhereToLook(false, "off", "ar").off).not.toBeNull();
  });
});
