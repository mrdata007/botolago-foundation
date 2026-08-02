export function selectFixtureGameweeks(
  gameweeks: readonly number[],
  current: number | undefined,
  range: number,
): number[] {
  const available = [...new Set(gameweeks)].sort((left, right) => left - right);
  if (available.length === 0 || range <= 0) return [];
  if (current === undefined) return available.slice(0, range);

  const currentIndex = available.findIndex((gameweek) => gameweek >= current);
  const start = currentIndex >= 0 ? currentIndex : Math.max(0, available.length - range);
  return available.slice(start, start + range);
}
