export interface FantasyPriceRules {
  readonly initialMinimum: number;
  readonly initialMaximum: number;
  readonly absoluteMinimum: number;
  readonly absoluteMaximum: number;
  readonly increment: number;
  readonly minimumNetTransfers: number;
  readonly smallRateThreshold: number;
  readonly largeRateThreshold: number;
  readonly smallMovement: number;
  readonly largeMovement: number;
  readonly maximumGameweekMovement: number;
  readonly saleProfitBlock: number;
  readonly saleProfitIncrement: number;
}

export const BOTOLAGO_PRICE_RULES_V1: FantasyPriceRules = {
  initialMinimum: 4,
  initialMaximum: 12.5,
  absoluteMinimum: 3.5,
  absoluteMaximum: 15,
  increment: 0.1,
  minimumNetTransfers: 250,
  smallRateThreshold: 0.03,
  largeRateThreshold: 0.08,
  smallMovement: 0.1,
  largeMovement: 0.2,
  maximumGameweekMovement: 0.2,
  saleProfitBlock: 0.2,
  saleProfitIncrement: 0.1,
};

export function calculatePriceMovement(
  transfersIn: number,
  transfersOut: number,
  activeTeams: number,
  rules: FantasyPriceRules = BOTOLAGO_PRICE_RULES_V1,
): number {
  if (![transfersIn, transfersOut, activeTeams].every(Number.isInteger) || activeTeams < 0)
    throw new Error("invalid_price_input");
  if (activeTeams === 0) return 0;
  const net = transfersIn - transfersOut;
  const minimumCount = Math.max(
    rules.minimumNetTransfers,
    Math.ceil(rules.smallRateThreshold * activeTeams),
  );
  if (Math.abs(net) < minimumCount) return 0;
  const rate = net / activeTeams;
  if (rate >= rules.largeRateThreshold) return rules.largeMovement;
  if (rate >= rules.smallRateThreshold) return rules.smallMovement;
  if (rate <= -rules.largeRateThreshold) return -rules.largeMovement;
  if (rate <= -rules.smallRateThreshold) return -rules.smallMovement;
  return 0;
}

export function applyPriceMovement(
  currentPrice: number,
  movement: number,
  rules: FantasyPriceRules = BOTOLAGO_PRICE_RULES_V1,
): number {
  const boundedMovement = Math.max(
    -rules.maximumGameweekMovement,
    Math.min(rules.maximumGameweekMovement, movement),
  );
  const next = Math.max(
    rules.absoluteMinimum,
    Math.min(rules.absoluteMaximum, currentPrice + boundedMovement),
  );
  return roundToIncrement(next, rules.increment);
}

export function calculateSalePrice(
  purchasePrice: number,
  currentPrice: number,
  rules: FantasyPriceRules = BOTOLAGO_PRICE_RULES_V1,
): number {
  if (purchasePrice <= 0 || currentPrice <= 0) throw new Error("invalid_price_input");
  if (currentPrice <= purchasePrice) return roundToIncrement(currentPrice, rules.increment);
  const retainedBlocks = Math.floor(
    (currentPrice - purchasePrice + Number.EPSILON) / rules.saleProfitBlock,
  );
  return roundToIncrement(
    purchasePrice + retainedBlocks * rules.saleProfitIncrement,
    rules.increment,
  );
}

function roundToIncrement(value: number, increment: number): number {
  const decimals = increment.toString().split(".")[1]?.length ?? 0;
  return Number((Math.round((value + Number.EPSILON) / increment) * increment).toFixed(decimals));
}
