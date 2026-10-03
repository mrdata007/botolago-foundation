import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";

import type { PredictionFixtureDto } from "@/backend/predictions/contracts";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { FixturePredictionCard, type FixtureScore } from "./FixturePredictionCard";

/**
 * What the card shows around a pick: the "Pronostiqué" tag on an open match
 * that has one, and the colour of a finished match's edge (exact, right
 * result, miss). Rendered with `react-dom/server` in French, like the other
 * component tests.
 */

const fr = dictionaries.fr;
const team = (name: string) => ({ id: name, name, shortName: name, crest: null });

const fixture = (over: Partial<PredictionFixtureDto> = {}): PredictionFixtureDto =>
  ({
    id: "fx-1",
    kickoffAt: "2026-10-03T18:00:00.000Z",
    kickoffConfirmed: true,
    status: "scheduled",
    open: true,
    home: team("RCA"),
    away: team("RSB"),
    live: null,
    result: null,
    final: false,
    void: false,
    corrected: false,
    ...over,
  }) as PredictionFixtureDto;

function card(props: {
  fixture: PredictionFixtureDto;
  pick: { home: number; away: number } | null;
  open: boolean;
  scored?: FixtureScore | null;
}): string {
  return renderToString(
    <I18nProvider>
      <FixturePredictionCard scored={props.scored ?? null} onStep={() => {}} {...props} />
    </I18nProvider>,
  ).replace(/<!-- -->/g, "");
}

describe("FixturePredictionCard", () => {
  it("tags an open match that has a pick, and not one that has none", () => {
    const picked = card({ fixture: fixture(), pick: { home: 2, away: 1 }, open: true });
    const empty = card({ fixture: fixture(), pick: null, open: true });
    expect(picked).toContain(fr["predictions.fixture.picked"]);
    expect(empty).not.toContain(fr["predictions.fixture.picked"]);
  });

  it("edges a finished match by how the pick did", () => {
    const final = fixture({ final: true, result: { home: 2, away: 1 }, open: false });
    const pick = { home: 2, away: 1 };
    const exact = card({ fixture: final, pick, open: false, scored: { points: 3, kind: "exact" } });
    const outcome = card({
      fixture: final,
      pick: { home: 1, away: 0 },
      open: false,
      scored: { points: 1, kind: "outcome" },
    });
    const miss = card({
      fixture: final,
      pick: { home: 0, away: 2 },
      open: false,
      scored: { points: 0, kind: "miss" },
    });
    expect(exact).toContain("border-s-[color:var(--ui-positive)]");
    expect(outcome).toContain("border-s-[color:var(--ui-ink-fg)]");
    expect(miss).toContain("border-s-[color:var(--ui-rule)]");
  });
});
