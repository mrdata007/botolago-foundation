import { Flag } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";

import { ui, UiIconButton, UiMenu, UiMenuItem } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { reportMailto, type ReportTarget } from "@/lib/report-content";
import { cn } from "@/lib/utils";
import { useReportCopy } from "./use-report-copy";

/**
 * The page being read, for the report: its origin and path, never its query
 * or fragment (nothing a reader did not choose to send).
 */
function currentPage(): string {
  if (typeof window === "undefined" || !window.location) return PUBLIC_SITE_ORIGIN;
  return `${window.location.origin}${window.location.pathname}`;
}

/**
 * The small round control in a table row: painted 32px so it does not crowd
 * the name it sits beside, with the kit's 44px target behind it (`hitArea`).
 * Quiet until pressed: a column of flags must not read as an accusation.
 */
const RowTrigger = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function RowTrigger({ className, ...props }, ref) {
    return (
      <button
        type="button"
        ref={ref}
        {...props}
        className={cn(
          "inline-grid h-8 w-8 shrink-0 place-items-center [&_svg]:h-4 [&_svg]:w-4",
          ui.hitArea,
          ui.radius.full,
          ui.tone.muted,
          "transition-colors hover:bg-[color:var(--ui-surface-sunken)] active:bg-[color:var(--ui-surface-sunken)] data-[state=open]:bg-[color:var(--ui-surface-sunken)]",
          ui.focus,
          className,
        )}
      />
    );
  },
);

/**
 * "Signaler" next to a name another user chose: their team, their league,
 * their username (App Store guideline 1.2). A menu with one entry per name
 * shown, each opening the reader's mail app on a pre-filled message to
 * support (`reportMailto`), so it needs nothing on the server.
 *
 * Callers render it only for OTHER people's names: never on the reader's own
 * row, team or league.
 *
 * `placement="row"` is the compact control for a table row; `"header"` is the
 * kit's 44px icon button, for a `UiHeader`'s `trailing` slot.
 */
export function ReportNameMenu({
  targets,
  placement = "row",
  className,
}: {
  /** What can be reported here, in menu order. The first one names the control. */
  targets: ReportTarget[];
  placement?: "row" | "header";
  className?: string;
}) {
  const { t } = useI18n();
  const copy = useReportCopy();
  const shown = targets.filter((target) => target.name.trim() !== "");
  if (shown.length === 0) return null;
  const label = t("report.menu_label").replace("{name}", shown[0].name.trim());

  const trigger =
    placement === "header" ? (
      <UiIconButton aria-label={label} data-report-trigger="" className={className}>
        <Flag aria-hidden />
      </UiIconButton>
    ) : (
      <RowTrigger aria-label={label} data-report-trigger="" className={className}>
        <Flag aria-hidden />
      </RowTrigger>
    );

  return (
    <UiMenu
      trigger={trigger}
      label={t("report.action")}
      // A long name truncates inside the menu rather than widening it off a phone.
      className="max-w-[min(20rem,calc(100vw_-_2rem))]"
    >
      {shown.map((target) => (
        <UiMenuItem key={`${target.kind}:${target.id}`} asChild>
          <a href={reportMailto(target, currentPage(), copy)} className="justify-start">
            <Flag className={cn("h-4 w-4 shrink-0", ui.tone.muted)} aria-hidden />
            <span className="flex min-w-0 flex-1 flex-col py-1.5">
              <span>
                {target.kind === "team"
                  ? t("report.team")
                  : target.kind === "league"
                    ? t("report.league")
                    : t("report.user")}
              </span>
              {/* Which name: the menu can hold a team and its manager. */}
              <span dir="auto" className={cn("truncate", ui.text.meta, ui.tone.muted)}>
                {target.name.trim()}
              </span>
            </span>
          </a>
        </UiMenuItem>
      ))}
    </UiMenu>
  );
}
