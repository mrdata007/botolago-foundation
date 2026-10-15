import { describe, expect, test } from "bun:test";
import { presentScore, scoreSentence } from "./match-score";

const KNOWN = "Score : {home} {hs}, {away} {as}";
const UNAVAILABLE = "Score indisponible : {home} contre {away}";
const names = { home: "Raja", away: "Wydad" };

describe("presentScore", () => {
  test("a score the provider never sent is unknown, not 0–0", () => {
    const score = presentScore({});
    expect(score.known).toBe(false);
    expect(score.home).toBeNull();
    expect(score.away).toBeNull();
    expect(score.homeText).toBe("—");
    expect(score.awayText).toBe("—");
    expect(score.text).toBe("— – —");
  });

  test("a real 0–0 stays 0–0", () => {
    const score = presentScore({ homeScore: 0, awayScore: 0 });
    expect(score.known).toBe(true);
    expect(score.home).toBe(0);
    expect(score.away).toBe(0);
    expect(score.text).toBe("0 – 0");
  });

  test("a played score is shown as it is", () => {
    const score = presentScore({ homeScore: 2, awayScore: 1 });
    expect(score).toMatchObject({ known: true, home: 2, away: 1, text: "2 – 1" });
  });

  test("a half-known score shows what is known and is not a complete score", () => {
    const score = presentScore({ homeScore: 2 });
    expect(score.known).toBe(false);
    expect(score.home).toBe(2);
    expect(score.away).toBeNull();
    expect(score.text).toBe("2 – —");
    expect(presentScore({ awayScore: 0 }).text).toBe("— – 0");
  });
});

describe("scoreSentence", () => {
  test("a known score fills the score template", () => {
    const score = presentScore({ homeScore: 0, awayScore: 0 });
    expect(scoreSentence(score, names, KNOWN, UNAVAILABLE)).toBe("Score : Raja 0, Wydad 0");
  });

  test("an unknown score says it is unavailable and never announces zeros", () => {
    const sentence = scoreSentence(presentScore({}), names, KNOWN, UNAVAILABLE);
    expect(sentence).toBe("Score indisponible : Raja contre Wydad");
    expect(sentence).not.toContain("0");
  });

  test("a half-known score is unavailable too", () => {
    const score = presentScore({ homeScore: 1 });
    expect(scoreSentence(score, names, KNOWN, UNAVAILABLE)).toBe(
      "Score indisponible : Raja contre Wydad",
    );
  });
});
