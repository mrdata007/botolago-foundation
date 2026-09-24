import type { ComponentType, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Trans } from "./Trans";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * Section header (Option A).
 *
 * The heading is the display face — `ui.display.section`, Changa 22/800 —
 * as the boards set "À venir", "Mes ligues", "Statistiques du match". It
 * supports:
 *   - `title`    a string (with optional `{accent}…{/accent}` markers, drawn
 *                in the themed brand foreground) or ready-made content
 *   - `action`   a trailing control on the title's line — use
 *                `SectionHeaderLink` for "Tout voir", which reaches 44px
 *   - `eyebrow`  a small uppercase kicker above the title, muted
 *   - `icon`     a small lucide glyph beside the kicker, in the brand foreground
 *   - `subtitle` a muted context line under the title
 *
 * The title and the action share one row, centred on each other. The action
 * is a 44px target on a ~28px title line, so its wrapper pulls the extra
 * height back out of the flow (`-my-2`): headings with and without an action
 * keep the same rhythm, and the link's box overhangs into the padding rather
 * than pushing the section down.
 *
 * Long titles truncate at 320px while the action stays pinned to the inline
 * end. Logical utilities only, so it mirrors in Arabic.
 */
export function SectionHeader({
  title,
  subtitle,
  action,
  eyebrow,
  icon: Icon,
  as: Tag = "h2",
  className,
}: {
  /** A string (with optional accent markers) or ready-made heading content. */
  title: string | ReactNode;
  subtitle?: string;
  action?: ReactNode;
  /** Short uppercase label rendered above the title. */
  eyebrow?: string;
  /** Small lucide icon rendered next to the eyebrow. */
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** The heading level; `h2` unless the section sits under another section. */
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <header className={cn("min-w-0 pb-2.5", className)}>
      {(eyebrow || Icon) && (
        <div className="mb-1 flex min-w-0 items-center gap-1.5">
          {Icon && <Icon className={cn("h-3.5 w-3.5 shrink-0", ui.tone.ink)} aria-hidden />}
          {/* `ui.text.label`: 12px, heavy, uppercase, `ltr:`-only tracking so
              Arabic letterforms are never pulled apart (BG-0124). Muted, as
              Option A sets every kicker; the title carries the weight. */}
          {eyebrow && (
            <span className={cn("min-w-0 truncate", ui.text.label, ui.tone.muted)}>{eyebrow}</span>
          )}
        </div>
      )}
      <div className="flex min-w-0 items-center justify-between gap-3">
        <Tag className={cn("min-w-0 truncate", ui.display.section, ui.tone.default)}>
          {typeof title === "string" ? <Trans text={title} accentClassName={ui.tone.ink} /> : title}
        </Tag>
        {action && <div className="-my-2 shrink-0">{action}</div>}
      </div>
      {subtitle && <p className={cn("mt-0.5 truncate", ui.text.meta, ui.tone.muted)}>{subtitle}</p>}
    </header>
  );
}

/**
 * The "Tout voir" link a section heading carries: heavy meta type in the
 * brand foreground, no chevron (the boards draw none), and a 44px target —
 * the boards' link had no height at all. Round hover plate, like every
 * other pressable in Option A.
 *
 * `children` replaces the default wording (`t("home.view_all")`).
 */
export function SectionHeaderLink({
  to,
  params,
  search,
  children,
  className,
}: {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
  children?: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <Link
      to={to}
      params={params}
      search={search}
      className={cn(
        "inline-flex items-center justify-center px-2",
        ui.space.tap,
        ui.radius.full,
        ui.text.meta,
        "[font-weight:var(--ui-weight-heavy)]",
        ui.tone.ink,
        "transition-colors duration-[var(--duration-quick)] hover:bg-[color:var(--ui-surface-sunken)]",
        ui.focus,
        className,
      )}
    >
      {children ?? t("home.view_all")}
    </Link>
  );
}

/**
 * The heading of a group INSIDE a section — a match day ("MERCREDI 23
 * SEPTEMBRE" … "2 matchs"): the uppercase label, muted, with an optional
 * muted count at the inline end. Quieter than a section title by design; it
 * sorts a list, it does not start a new part of the page.
 */
export function SectionGroupHeader({
  title,
  meta,
  as: Tag = "h3",
  className,
}: {
  title: ReactNode;
  /** A short trailing note, usually a count ("2 matchs"). */
  meta?: ReactNode;
  as?: "h2" | "h3" | "h4" | "p";
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-baseline justify-between gap-3 pb-2", className)}>
      <Tag className={cn("min-w-0 truncate", ui.text.label, ui.tone.muted)}>{title}</Tag>
      {meta ? <span className={cn("shrink-0", ui.text.meta, ui.tone.muted)}>{meta}</span> : null}
    </div>
  );
}
