/**
 * Small uppercase brand-blue label placed above an H1 to introduce a
 * screen section. RTL-safe (uses logical text-align via inheritance).
 * Kept intentionally compact so it reads as a supporting label, never
 * competing with the headline.
 */
export function AccentEyebrow({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`text-[11px] font-black uppercase tracking-[0.14em] text-brand ${className}`.trim()}
    >
      {children}
    </div>
  );
}
