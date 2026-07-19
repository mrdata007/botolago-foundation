import type { ReactNode } from "react";
import { Trans } from "./Trans";

// Design System V2 — Section header.
// Adds a slim brand accent bar to the eyebrow and enforces min-w-0 so long
// titles truncate cleanly at 320px.

export function SectionHeader({
  title,
  action,
  subtitle,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /** Optional short brand-blue label rendered above the title. */
  eyebrow?: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 pt-6 pb-3">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1.5 inline-flex items-center gap-2">
            <span
              aria-hidden
              className="h-3 w-0.5 rounded-full"
              style={{ background: "var(--brand-accent)" }}
            />
            <span className="truncate text-[10px] font-black uppercase tracking-[0.16em] text-brand">
              {eyebrow}
            </span>
          </div>
        )}
        <h2 className="truncate text-lg font-black tracking-tight text-foreground">
          <Trans text={title} />
        </h2>
        {subtitle && (
          <p className="mt-0.5 truncate text-xs text-[color:var(--text-secondary)]">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
