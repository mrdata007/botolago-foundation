import type { ComponentType, ReactNode } from "react";
import { Trans } from "./Trans";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

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
 * The eyebrow is icon + label only. It also carried a 2px accent bar, which
 * on top of the icon, the uppercase kicker and the two-tone title was one
 * signal too many, repeated on every section of Home.
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
  /** A string (with optional accent markers) or ready-made heading content. */
  title: string | ReactNode;
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
            {Icon && (
              <Icon className="h-3.5 w-3.5 shrink-0 text-[color:var(--brand-accent)]" aria-hidden />
            )}
            {/* On the ramp rather than on a 10px literal (BG-0124). This is
                exactly what `ui.text.label` is: 12px, heavy, uppercase, with
                `ltr:`-prefixed tracking so Arabic letterforms are never pulled
                apart. The 10px had no leading, so at 768px the Arabic eyebrow
                was cut inside its own `truncate`.

                `text-brand` also went with it: `ui.tone.ink` is `--ui-ink-fg`,
                which is theme-correct, where `--brand-primary` is the same
                colour in both themes (BG-0083). A no-op in light, and the
                reason this line works when dark mode is switched on. */}
            {eyebrow && (
              <span className={cn("truncate", ui.text.label, ui.tone.ink)}>{eyebrow}</span>
            )}
          </div>
        )}
        <h2 className={cn("truncate", ui.text.section, ui.tone.default)}>
          {typeof title === "string" ? <Trans text={title} /> : title}
        </h2>
        {subtitle && (
          <p className={cn("mt-0.5 truncate", ui.text.meta, ui.tone.muted)}>{subtitle}</p>
        )}
      </div>
      {/* On the title's line, not floating between eyebrow and title. */}
      {action && <div className="shrink-0 self-end">{action}</div>}
    </header>
  );
}
