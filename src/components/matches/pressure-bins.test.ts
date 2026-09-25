import { describe, expect, it } from "bun:test";
import { pressureBins, pressureShare } from "./pressure-bins";

const point = (minute: number, homeValue: number | null, awayValue: number | null) => ({
  minute,
  homeValue,
  awayValue,
});

describe("pressureBins", () => {
  it("averages each club over the minutes the provider sent, five minutes a bin", () => {
    expect(
      pressureBins([
        point(1, 10, null),
        point(2, 20, null),
        point(3, null, 30),
        point(6, 0, 0),
        point(10, 40, null),
      ]),
    ).toEqual([
      { from: 1, to: 5, home: 10, away: 10 },
      { from: 6, to: 10, home: 20, away: 0 },
    ]);
  });

  it("puts minute 0 in the first bin, and runs into stoppage time", () => {
    const bins = pressureBins([point(0, 5, null), point(93, null, 12)]);
    expect(bins[0]).toEqual({ from: 1, to: 5, home: 5, away: 0 });
    expect(bins.at(-1)).toEqual({ from: 91, to: 95, home: 0, away: 12 });
    expect(bins).toHaveLength(19);
  });

  it("never skips a stretch of the axis the provider sent nothing for", () => {
    const bins = pressureBins([point(1, 1, null), point(21, 2, null)]);
    expect(bins.map((bin) => [bin.from, bin.home])).toEqual([
      [1, 1],
      [6, 0],
      [11, 0],
      [16, 0],
      [21, 2],
    ]);
  });

  it("draws nothing from nothing", () => {
    expect(pressureBins([])).toEqual([]);
  });
});

describe("pressureShare", () => {
  it("is each club's share of all the pressure, in whole percents adding to 100", () => {
    expect(pressureShare([point(1, 20, null), point(2, null, 10), point(3, 3.4, null)])).toEqual({
      home: 70,
      away: 30,
    });
  });

  it("is null when there was no pressure at all", () => {
    expect(pressureShare([point(1, 0, null), point(2, null, 0)])).toBeNull();
    expect(pressureShare([])).toBeNull();
  });
});
