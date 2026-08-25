import { describe, expect, test } from "bun:test";

import { OAUTH_CONSENT_COPY } from "./oauth-consent-copy";

describe("OAuth consent localization", () => {
  test("provides complete French consent actions and fallback copy", () => {
    expect(OAUTH_CONSENT_COPY.fr.title("Atlas App")).toContain("Atlas App");
    expect(OAUTH_CONSENT_COPY.fr.description("Atlas App")).toContain("équipe Fantasy");
    expect(OAUTH_CONSENT_COPY.fr.approve).toBe("Autoriser");
    expect(OAUTH_CONSENT_COPY.fr.deny).toBe("Refuser");
    expect(OAUTH_CONSENT_COPY.fr.errorTitle).toBeTruthy();
    expect(OAUTH_CONSENT_COPY.fr.errorBody).toBeTruthy();
  });

  test("provides complete Arabic consent actions and fallback copy", () => {
    expect(OAUTH_CONSENT_COPY.ar.title("تطبيق أطلس")).toContain("تطبيق أطلس");
    expect(OAUTH_CONSENT_COPY.ar.description("تطبيق أطلس")).toContain("الفانتازي");
    expect(OAUTH_CONSENT_COPY.ar.approve).toBe("سماح");
    expect(OAUTH_CONSENT_COPY.ar.deny).toBe("رفض");
    expect(OAUTH_CONSENT_COPY.ar.errorTitle).toBeTruthy();
    expect(OAUTH_CONSENT_COPY.ar.errorBody).toBeTruthy();
  });
});

