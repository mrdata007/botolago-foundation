import { LogIn, ShieldCheck, UserPlus, Users } from "lucide-react";

import { ui, UiLinkButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

type ProtectedFantasyRoute =
  | "/fantasy"
  | "/fantasy/team"
  | "/fantasy/points"
  | "/fantasy/transfers"
  | "/fantasy/leagues";

/**
 * Signed-out gate for a protected Fantasy surface.
 *
 * Converted to the kit (BG-0092). It used to be a `surface-4` glass panel
 * with a `cta-brand` button, a `rounded-2xl` glyph tile, the Tailwind type
 * ramp and `--brand-primary` as a text colour on the "browse players"
 * escape hatch — the last of which measured 1.35:1 in dark. The blurred
 * accent blob is gone with the glass: it was drawn from `--brand-accent`,
 * which has no dark counterpart.
 */
export function FantasyAccessGate({
  next,
  compact,
}: {
  next: ProtectedFantasyRoute;
  compact?: boolean;
}) {
  const { t } = useI18n();

  return (
    <section
      aria-labelledby="fantasy-access-title"
      className={cn("text-center", ui.surface.card, compact ? "p-4" : "p-5")}
    >
      <span
        className={cn(
          "mx-auto grid h-12 w-12 place-items-center",
          ui.radius.control,
          "text-[color:var(--ui-ink-deep)]",
        )}
        style={{ backgroundImage: "var(--ui-grad-action)" }}
        aria-hidden
      >
        <ShieldCheck className="h-6 w-6" />
      </span>
      <h1
        id="fantasy-access-title"
        className={cn("mt-3", compact ? ui.text.section : ui.text.title, ui.tone.default)}
      >
        {t("auth.prompt.title")}
      </h1>
      <p className={cn("mx-auto mt-2 max-w-md", ui.text.prose, ui.tone.muted)}>
        {t("auth.prompt.body")}
      </p>

      <div className="mx-auto mt-5 grid max-w-md gap-2 sm:grid-cols-2">
        <UiLinkButton to="/auth/login" search={{ next }} variant="gradient">
          <LogIn className="h-4 w-4 shrink-0" aria-hidden />
          {t("auth.prompt.login")}
        </UiLinkButton>
        <UiLinkButton to="/auth/register" search={{ next }} variant="outline">
          <UserPlus className="h-4 w-4 shrink-0" aria-hidden />
          {t("auth.prompt.register")}
        </UiLinkButton>
      </div>

      <div className="mt-4 flex justify-center">
        <UiLinkButton to="/fantasy/players" variant="ghost" size="sm">
          <Users className="h-4 w-4 shrink-0" aria-hidden />
          {t("fantasy.tab.players")}
        </UiLinkButton>
      </div>
    </section>
  );
}
