import { describe, expect, test } from "bun:test";
import {
  POINTS_READY_VARIANTS,
  renderPointsReadyEmail,
  type PointsReadyEmailInput,
} from "./fantasy-points-ready-email";

const base: PointsReadyEmailInput = {
  language: "fr",
  variant: "score-reveal",
  state: "finalized",
  pendingPlayers: 0,
  points: 76,
  gameweek: 4,
  appUrl: "https://botolago.com",
  unsubscribeUrl: "https://botolago.com/unsubscribe?token=sample",
};
describe("points-ready email publication boundary", () => {
  test("never tells a manager provisional or incomplete points are ready", () => {
    expect(() => renderPointsReadyEmail({ ...base, state: "provisional" })).toThrow(
      "points_not_ready",
    );
    for (const pendingPlayers of [1, -1, NaN, Infinity])
      expect(() => renderPointsReadyEmail({ ...base, pendingPlayers })).toThrow("points_not_ready");
    expect(() => renderPointsReadyEmail({ ...base, points: NaN })).toThrow(
      "points_ready_invalid_score",
    );
  });
  test("zero and negative totals remain their real values", () => {
    expect(renderPointsReadyEmail({ ...base, points: 0 }).text).toContain("Journée 4 : 0 points");
    expect(renderPointsReadyEmail({ ...base, points: -4 }).text).toContain("Journée 4 : -4 points");
  });
  test("score copy preserves small, zero and negative totals without forcing a fixed plural", () => {
    for (const variant of POINTS_READY_VARIANTS)
      for (const points of [0, 1, -1, 2, 3, 10, -4])
        for (const language of ["fr", "ar"] as const) {
          const email = renderPointsReadyEmail({ ...base, variant, points, language });
          expect(`${email.subject} ${email.preheader}`).toContain(String(points));
          if (language === "fr") {
            const unit = Math.abs(points) === 1 ? "point" : "points";
            expect(email.text).toContain(`${points} ${unit}`);
            if (Math.abs(points) === 1) expect(email.text).not.toContain(`${points} points`);
          } else {
            // Intl adds directional marks before negative Arabic-locale numbers.
            const text = email.text.replace(/[\u061c\u200e\u200f]/g, "");
            expect(text).toContain(`مجموع النقاط: ${points}`);
            // A label before the count avoids a singular noun after every value.
            expect(`${email.subject} ${email.preheader} ${email.text}`).not.toMatch(
              new RegExp(`${points}\\s+نقطة`),
            );
          }
        }
  });
  test("dynamic text cannot inject HTML, subject controls, or unsafe links", () => {
    const email = renderPointsReadyEmail({
      ...base,
      managerName: "<img src=x onerror=alert(1)>\r\n\u202etest",
    });
    expect(email.html).toContain("&lt;img");
    expect(email.html).not.toContain("<img src=x");
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(() => renderPointsReadyEmail({ ...base, appUrl: "javascript:alert(1)" })).toThrow();
    expect(() =>
      renderPointsReadyEmail({
        ...base,
        unsubscribeUrl: "https://other.example/unsubscribe?token=x",
      }),
    ).toThrow("points_ready_invalid_unsubscribe");
  });
  test("all directions have the real artwork, readable text and a single score CTA in both languages", () => {
    const subjects = new Set<string>();
    for (const variant of POINTS_READY_VARIANTS)
      for (const language of ["fr", "ar"] as const) {
        const email = renderPointsReadyEmail({
          ...base,
          variant,
          language,
          overallRank: null,
          totalPoints: null,
        });
        subjects.add(email.subject);
        expect(email.html).toContain(
          `lang="${language}" dir="${language === "ar" ? "rtl" : "ltr"}"`,
        );
        expect(email.html).toContain('alt="BotolaGO"');
        expect(email.html).toContain("/email/botolago-wordmark-");
        expect(email.html.match(/href="https:\/\/botolago.com\/fantasy\/points"/g)).toHaveLength(1);
        expect(email.text).toContain(base.unsubscribeUrl);
        expect(email.html).not.toContain("#0</span>");
        expect(email.html).not.toContain("<script");
      }
    expect(subjects.size).toBe(6);
  });
});
