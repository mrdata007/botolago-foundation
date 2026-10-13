/**
 * Monotonic guard for async session-derived work.
 *
 * A token remains current only until a later auth event or explicit invalidation.
 * This is deliberately independent from React and Supabase so ordering can be
 * proven with a small deterministic unit test.
 */
export class AsyncSessionFence {
  private revision = 0;

  snapshot(): number {
    return this.revision;
  }

  begin(): number {
    this.revision += 1;
    return this.revision;
  }

  invalidate(): void {
    this.revision += 1;
  }

  isCurrent(revision: number): boolean {
    return revision === this.revision;
  }
}
