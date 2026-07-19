import type { ComponentType, ReactNode } from "react";
import { Trans } from "./Trans";

/**
 * Design System V2 — Section header.
 *
 * Every section on Home should feel distinct. This header supports:
 *   - `eyebrow`  short brand-blue kicker (e.g. "MATCHS", "NEWS")
 *   - `icon`     small lucide icon that anchors the section identity
 *   - `title`    supports Trans accent markers ({accent}…{/accent})
 *   - `subtitle` optional muted context line
 *   - `action`   trailing action (e.g. "Tout voir")
 *
 * Layout is a two-column grid so long titles truncate cleanly at 320px
 * while trailing actions stay pinned to the inline-end. Fully RTL-safe.
 */
export function SectionHeader({
  title,
  subtitle,
  action,
  eyebrow,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /** Short brand-blue label rendered above the title. */
  eyebrow?: string;
  /** Small lucide icon rendered next to the eyebrow. */
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 pb-3">
      <div className="min-w-0">
        {(eyebrow || Icon) && (
          <div className="mb-1.5 inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-3 w-0.5 shrink-0 rounded-full"
              style={{ background: "var(--brand-accent)" }}
            />
            {Icon && (
              <Icon
                className="h-3.5 w-3.5 shrink-0 text-[color:var(--brand-accent)]"
                aria-hidden
              />
            )}
            {eyebrow && (
              <span className="truncate text-[10px] font-black uppercase tracking-[0.16em] text-brand">
                {eyebrow}
              </span>
            )}
          </div>
        )}
        <h2 className="truncate text-[17px] font-black tracking-tight text-foreground sm:text-lg">
          <Trans text={title} />
        </h2>
        {subtitle && (
          <p className="mt-0.5 truncate text-xs text-[color:var(--text-secondary)]">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </header>
  );
}
