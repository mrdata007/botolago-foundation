import { describe, expect, test } from "bun:test";

import { assessOriginality, longestSharedRun, SIMILARITY_REJECT_THRESHOLD } from "./similarity";
import { tokenize } from "../normalization/text";

const SOURCE_TEXT = `Raja Casablanca confirmed on Sunday that they have completed the signing of midfielder Ayoub Nasser from Hassania Agadir. The club said the 24-year-old has agreed a three-year contract and will join up with the squad before the next Botola Pro fixture. Coach Karim Bencherifa told reporters that the player had been a target since the summer window opened. Hassania Agadir confirmed the transfer in a short statement on their official channels.`;

const sources = [{ itemId: "item-1", text: SOURCE_TEXT }];

describe("news engine originality gate", () => {
  test("rejects a draft that reuses the source's sentences", () => {
    // The failure this gate exists to prevent: a "rewrite" that is the source
    // with a few words swapped.
    const copied = `<p>Raja Casablanca confirmed on Sunday that they have completed the signing of midfielder Ayoub Nasser from Hassania Agadir.</p><p>The club said the 24-year-old has agreed a three-year contract and will join up with the squad before the next Botola Pro fixture.</p><p>Coach Karim Bencherifa told reporters that the player had been a target since the summer window opened.</p>`;
    const report = assessOriginality(copied, sources);
    expect(report.verdict).toBe("needs_regeneration");
    expect(report.maxScore).toBeGreaterThan(SIMILARITY_REJECT_THRESHOLD);
  });

  test("rejects a synonym-swapped rewrite", () => {
    // Every noun phrase is intact; only the connective words changed. This is
    // the case a naive word-level check would let through.
    const swapped = `<p>Raja Casablanca announced on Sunday that they have finalised the signing of midfielder Ayoub Nasser from Hassania Agadir.</p><p>The club stated the 24-year-old has signed a three-year contract and will join up with the squad before the next Botola Pro fixture.</p><p>Coach Karim Bencherifa informed reporters that the player had been a target since the summer window opened.</p>`;
    const report = assessOriginality(swapped, sources);
    expect(report.verdict).not.toBe("passed");
  });

  test("passes genuinely independent composition of the same facts", () => {
    const original = `<p>Ayoub Nasser is a Raja Casablanca player. The Casablanca side put the 24-year-old midfielder's arrival from Hassania Agadir beyond doubt on Sunday, describing a deal that runs to 2029.</p><p>He is expected in training ahead of the team's next league outing. Karim Bencherifa, who has wanted the player since the window opened, will decide whether to involve him immediately.</p><p>Agadir acknowledged the departure briefly through their own channels.</p>`;
    const report = assessOriginality(original, sources);
    expect(report.verdict).toBe("passed");
    expect(report.maxScore).toBeLessThan(SIMILARITY_REJECT_THRESHOLD);
  });

  test("does not penalise a quotation the draft is entitled to reproduce", () => {
    const quote = "He has been a target since the summer window opened and we are delighted.";
    const sourceWithQuote = [
      { itemId: "item-1", text: `${SOURCE_TEXT} Bencherifa said: "${quote}"` },
    ];
    const draft = `<p>Ayoub Nasser has joined Raja Casablanca from Hassania Agadir on a deal to 2029, the Casablanca club said on Sunday.</p><p>Karim Bencherifa commented: "${quote}"</p><p>His new side expect him in training this week.</p>`;
    const report = assessOriginality(draft, sourceWithQuote, { allowedQuotes: [quote] });
    expect(report.verdict).toBe("passed");
  });

  test("a single long copied span fails on its own", () => {
    const mostlyOriginal = `<p>A deal is done in Casablanca. The club said the 24-year-old has agreed a three-year contract and will join up with the squad before the next Botola Pro fixture, which settles weeks of speculation about the midfielder's future in the league this season.</p>`;
    const report = assessOriginality(mostlyOriginal, sources);
    expect(report.verdict).toBe("needs_regeneration");
    expect(report.reason).toContain("identical to the source");
  });

  test("flags a draft that is too short to assess rather than passing it", () => {
    const report = assessOriginality("<p>Short.</p>", sources);
    expect(report.verdict).toBe("needs_regeneration");
  });

  test("reports the worst source, not the average", () => {
    const manySources = [
      { itemId: "clean", text: "Completely unrelated text about a basketball tournament." },
      { itemId: "copied", text: SOURCE_TEXT },
    ];
    const copied = `<p>Raja Casablanca confirmed on Sunday that they have completed the signing of midfielder Ayoub Nasser from Hassania Agadir. The club said the 24-year-old has agreed a three-year contract.</p>`;
    const report = assessOriginality(copied, manySources);
    expect(report.verdict).toBe("needs_regeneration");
  });
});

describe("longestSharedRun", () => {
  test("finds the longest consecutive token overlap", () => {
    const draft = tokenize("alpha beta gamma delta epsilon");
    const source = tokenize("zeta beta gamma delta omega");
    expect(longestSharedRun(draft, source)).toBe(3);
  });

  test("returns zero when nothing is shared", () => {
    expect(longestSharedRun(tokenize("one two"), tokenize("three four"))).toBe(0);
  });

  test("handles empty input", () => {
    expect(longestSharedRun([], tokenize("a b"))).toBe(0);
  });
});
