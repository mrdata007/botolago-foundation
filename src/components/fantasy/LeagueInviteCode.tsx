import { Copy } from "lucide-react";
import { toast } from "sonner";

import { ui, UiButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * The invite code, made shareable. Shared by the leagues page (after a league
 * is created) and the league page (after its owner issues a new code).
 *
 * The backend mints a 32-character hex string (`0035D6D8995B37EA0F05E2331C21FC0F`).
 * Nobody can read that down a phone line, and as one unbroken run it also wraps
 * mid-token on a 390px screen. This does the three things presentation can do
 * about it: group it into fours so the eye can chunk it, set it in a monospaced
 * face at tabular width so `0`/`O` and `1`/`I` are distinguishable, and put a
 * copy control next to it — because copying is what anyone sharing this will
 * actually do.
 *
 * `dir="ltr"` is deliberate even in Arabic: the code is a hex literal, not
 * prose, and must be read and transcribed left to right in both languages.
 * The grouping is visual only — a screen-reader-only copy and the clipboard
 * both carry the original unbroken string, so a screen reader and a paste get
 * the real code. `once` adds the warning that it will not be shown again (only
 * a digest is stored), for the league page's newly issued code.
 */
export function LeagueInviteCode({
  code,
  once = false,
  className,
}: {
  code: string;
  once?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const groups = code.match(/.{1,4}/g) ?? [code];
  return (
    <div className={cn("mt-3 p-3", ui.radius.card, ui.surface.page, className)}>
      <p className={cn(ui.text.label, ui.tone.muted)}>{t("fpl.invite_code")}</p>
      <div className="mt-1 flex items-start gap-2">
        <code
          dir="ltr"
          className={cn(
            "min-w-0 flex-1 select-all break-words font-mono",
            ui.text.meta,
            // An invite code is a figure a reader copies character by
            // character, so it is on the tabular rail like every other figure.
            "[font-weight:var(--ui-weight-heavy)]",
            ui.text.tabular,
            ui.tone.default,
          )}
        >
          {groups.map((group, index) => (
            <span key={`${group}-${index}`} className="me-1.5 inline-block" aria-hidden>
              {group}
            </span>
          ))}
          {/* The real code, unbroken, for a screen reader: the groups are
              visual only. */}
          <span className="sr-only">{code}</span>
        </code>
        <UiButton
          size="sm"
          variant="soft"
          aria-label={t("fantasy.leagues.copy_code")}
          className="shrink-0"
          onClick={() => {
            void navigator.clipboard?.writeText(code);
            toast.success(t("fpl.copied"));
          }}
        >
          <Copy className="h-4 w-4" aria-hidden />
          {t("fpl.copy")}
        </UiButton>
      </div>
      {once ? (
        <p
          className={cn(
            "mt-2",
            ui.text.meta,
            "[font-weight:var(--ui-weight-strong)]",
            ui.tone.default,
          )}
        >
          {t("predictions.leagues.code_once")}
        </p>
      ) : null}
      <p className={cn("mt-2", ui.text.meta, ui.tone.muted)}>{t("fantasy.leagues.invite_help")}</p>
    </div>
  );
}
