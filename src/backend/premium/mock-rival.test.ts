import { describe, expect, it } from "bun:test";

import { mockDuel } from "./card-reads-mock";
import { rivalSeries } from "./mock-rival";

const total = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

describe("the development duel agrees with the standings it opens from", () => {
  it("a league mate's duel total is their league total (the lead is the table's gap)", () => {
    // Casablanca Derby: the reader 612, Karim F. (m4) 605, Salma B. (m2) 651.
    expect(total(rivalSeries("m4"))).toBe(605);
    expect(total(rivalSeries("m2"))).toBe(651);
    const duel = mockDuel("m4");
    expect(
      total(duel.weeks.map((w) => w.me.score)) - total(duel.weeks.map((w) => w.opponent.score)),
    ).toBe(7);
  });
  it("an unknown rival keeps the example season's", () => {
    expect(total(rivalSeries("t2"))).toBe(598);
  });
});
