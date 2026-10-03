/**
 * A date-time in UTC, written the same way on the server and in the browser and
 * the same in both languages: "2026-10-02 07:00 UTC". Digits and ISO order are
 * data, so they are not translated or reordered; callers draw it as LTR.
 */
export function formatUtc(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
