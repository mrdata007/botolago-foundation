import { describe, expect, it } from "bun:test";
import {
  applyPriceMovement,
  BOTOLAGO_INITIAL_PRICE_ALGORITHM_V1,
  calculateInitialCatalogPrice,
  calculatePriceMovement,
  calculateSalePrice,
} from "./pricing";

describe("BotolaGO Fantasy price rules v1.0", () => {
  it("publishes a stable initial catalog pricing algorithm", () => {
    expect(BOTOLAGO_INITIAL_PRICE_ALGORITHM_V1).toBe("botolago-initial-price-v1.0");
    expect(calculateInitialCatalogPrice("GK", 6, 0)).toBe(4.8);
    expect(calculateInitialCatalogPrice("DEF", 6, 0)).toBe(5);
    expect(calculateInitialCatalogPrice("MID", 6, 0)).toBe(7.2);
    expect(calculateInitialCatalogPrice("FWD", 6, 0)).toBe(7.2);
  });

  it("maps full-confidence position-relative ratings into bounded price bands", () => {
    expect(calculateInitialCatalogPrice("GK", 4, 1)).toBe(4);
    expect(calculateInitialCatalogPrice("GK", 10, 1)).toBe(6.5);
    expect(calculateInitialCatalogPrice("DEF", 10, 1)).toBe(7);
    expect(calculateInitialCatalogPrice("MID", 4, 1)).toBe(4.5);
    expect(calculateInitialCatalogPrice("FWD", 10, 1)).toBe(12.5);
  });

  it("shrinks incomplete historical evidence toward the neutral price", () => {
    expect(calculateInitialCatalogPrice("MID", 10, 0.5)).toBe(9.8);
    expect(calculateInitialCatalogPrice("MID", 4, 0.5)).toBe(5.8);
  });

  it("rejects invalid initial-pricing evidence", () => {
    expect(() => calculateInitialCatalogPrice("MID", 3.9, 1)).toThrow(
      "invalid_initial_price_input",
    );
    expect(() => calculateInitialCatalogPrice("FWD", 6, 1.1)).toThrow(
      "invalid_initial_price_input",
    );
  });

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
