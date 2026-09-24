/**
 * A football, for goals (the boards' glyph): a ring and the centre panel.
 * Lucide has no football — its `Goal` is a net with a flag, which reads as a
 * target at 16px. `currentColor` only, so it takes the tone it sits in, and
 * decorative: the event's words say "But".
 */
export function BallIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
      focusable="false"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m12 7 4 3-1.5 5h-5L8 10z" fill="currentColor" stroke="none" />
    </svg>
  );
}
