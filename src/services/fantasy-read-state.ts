// UX-003 — a read that failed is not a read that found nothing.
//
// The league screens turned `data ?? []` into "no leagues" / "no members", so a
// failed read looked like lost leagues. This names the five things a list read
// can be, so every league list says the right one.

export type ListReadView =
  /** No answer yet, and nothing failed. */
  | "loading"
  /** The first read failed: there is nothing to show, and the reader must be able to retry. */
  | "failed"
  /** A refresh failed: the rows of the last successful read are kept, and flagged. */
  | "stale"
  /** The read succeeded and the list is genuinely empty. */
  | "empty"
  | "ready";

export function listReadView(read: {
  isError: boolean;
  data: readonly unknown[] | undefined;
}): ListReadView {
  if (read.data === undefined) return read.isError ? "failed" : "loading";
  if (read.isError) return "stale";
  return read.data.length === 0 ? "empty" : "ready";
}
