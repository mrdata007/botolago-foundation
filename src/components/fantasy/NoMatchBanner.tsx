import { TriangleAlert } from "lucide-react";

import { ui, UiButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * Above the pitch when a starter's club has no match this round:
 * "X n'a pas de match en J2. Passez en 3-4-3 avec Y." and a one-tap button
 * that makes the swap. Without a legal swap (`swap` absent) it only warns.
 * The words are the caution colour's, never the live colour's.
 */
export function NoMatchBanner({
  name,
  gameweek,
  swap,
  onApply,
}: {
  name: string;
  gameweek: number;
  swap?: { inName: string; formation: string; formationChanged: boolean };
  onApply?: () => void;
}) {
  const { t, lang } = useI18n();
  const gw = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR").format(gameweek);
  const text = swap
    ? (swap.formationChanged
        ? t("fantasy.team.no_match_swap_formation")
        : t("fantasy.team.no_match_swap_same")
      )
        .replace("{name}", name)
        .replace("{gw}", gw)
        .replace("{formation}", swap.formation)
        .replace("{in}", swap.inName)
    : t("fantasy.team.no_match_only").replace("{name}", name).replace("{gw}", gw);
  return (
    <div
      role="status"
      data-testid="no-match-banner"
      className={cn(
        "flex items-start gap-3 p-3",
        ui.radius.card,
        "bg-[color:color-mix(in_oklab,var(--ui-caution)_22%,var(--ui-surface))]",
        ui.tone.default,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid h-6 w-6 shrink-0 place-items-center",
          ui.radius.full,
          "bg-[color:var(--ui-caution)]",
          ui.tone.onCaution,
        )}
      >
        <TriangleAlert className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn(ui.text.secondary, "[font-weight:var(--ui-weight-heavy)]")}>
          <bdi>{text}</bdi>
        </p>
        {swap && onApply ? (
          <UiButton size="sm" variant="ink" className="mt-2" onClick={onApply}>
            {t("fantasy.team.no_match_apply")}
          </UiButton>
        ) : null}
      </div>
    </div>
  );
}
