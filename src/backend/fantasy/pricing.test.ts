import { describe, expect, it } from "bun:test";
import { applyPriceMovement, calculatePriceMovement, calculateSalePrice } from "./pricing";

describe("BotolaGO Fantasy price rules v1.0", () => {
  it("applies the approved net-transfer thresholds", () => {
    expect(calculatePriceMovement(1_499, 0, 50_000)).toBe(0);
    expect(calculatePriceMovement(1_500, 0, 50_000)).toBe(0.1);
    expect(calculatePriceMovement(4_000, 0, 50_000)).toBe(0.2);
    expect(calculatePriceMovement(0, 1_500, 50_000)).toBe(-0.1);
    expect(calculatePriceMovement(0, 4_000, 50_000)).toBe(-0.2);
  });

  it("requires at least 250 net transfers for small populations", () => {
    expect(calculatePriceMovement(249, 0, 1_000)).toBe(0);
    expect(calculatePriceMovement(250, 0, 1_000)).toBe(0.2);
  });

  it("caps movement and absolute price boundaries", () => {
    expect(applyPriceMovement(12, 0.8)).toBe(12.2);
    expect(applyPriceMovement(14.9, 0.2)).toBe(15);
    expect(applyPriceMovement(3.6, -0.2)).toBe(3.5);
  });

  it("uses half-profit sale pricing", () => {
    expect(calculateSalePrice(7, 7.5)).toBe(7.2);
    expect(calculateSalePrice(7, 7.1)).toBe(7);
    expect(calculateSalePrice(7, 6.8)).toBe(6.8);
  });
});
