import { ArrowRight } from "lucide-react";

import { useDeadlineCountdown } from "@/components/fpl/deadline";
import { ui, UiLinkButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { moroccoDateTimeFormat } from "@/lib/morocco-time";
import { cn } from "@/lib/utils";

/**
 * Home's Fantasy invitation for a visitor without an account: a card among the
 * page's sections rather than a full-screen advert. The kicker, the title, the
 * real next deadline (date and time on the Casablanca clock; left out once it
 * has passed), one "Créer mon équipe" button and the line saying an account is
 * asked only to save the team.
 *
 * Where no team can be created now (`canCreate` false: the season is closed,
 * or this gameweek's entries are), the button leads to the player list, as the
 * gradient card it replaces did.
 */
export function FantasyInviteCard({
  canCreate,
  deadline,
}: {
  canCreate: boolean;
  deadline?: string;
}) {
  const { t, lang } = useI18n();
  const passed = useDeadlineCountdown(deadline)?.passed === true;
  const when =
    deadline && !passed
      ? moroccoDateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(deadline))
      : null;
  const [before = "", after = ""] = t("home.fantasy_chip_deadline").split("{when}");
  return (
    <div
      data-testid="fantasy-invite"
      className={cn(
        "flex min-w-0 flex-col gap-3 px-5 py-5",
        ui.radius.sheet,
        "bg-[color:var(--ui-ink-deep)]",
        ui.tone.onInkPlain,
      )}
    >
      <p className={ui.text.label}>{t("landing.kicker")}</p>
      <h3 className={ui.display.section}>{t("home.invite_title")}</h3>
      {when ? (
        <p className={ui.text.body}>
          {before}
          <bdi className={ui.text.tabular}>{when}</bdi>
          {after}
        </p>
      ) : null}
      <UiLinkButton
        to={canCreate ? "/fantasy/create" : "/fantasy/players"}
        className="w-full gap-2"
      >
        {canCreate ? t("fantasy.create.title") : t("fantasy.next.explore")}
        <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
      </UiLinkButton>
      <p className={cn("text-center", ui.text.meta)}>{t("landing.cta_note")}</p>
    </div>
  );
}
