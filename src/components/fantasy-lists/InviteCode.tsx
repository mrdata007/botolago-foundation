import { Copy } from "lucide-react";
import { toast } from "sonner";

import { ui, UiButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * The invite code, made shareable. Shown right after a league is created and
 * right after its owner replaces the code — the only two moments the full code
 * exists outside the database, which keeps just a digest of it.
 *
 * The backend mints a 32-character hex string (`0035D6D8995B37EA0F05E2331C21FC0F`).
 * Nobody can read that down a phone line, and as one unbroken run it also wraps
 * mid-token on a 390px screen. This does the three things presentation can do
 * about it: group it into fours so the eye can chunk it, set it in a monospaced
 * face at tabular width so `0`/`O` and `1`/`I` are distinguishable, and put a
 * copy control next to it — because copying is what anyone sharing this will
 * actually do. It also says the code will not be shown again, because it will
 * not.
 *
 * `dir="ltr"` is deliberate even in Arabic: the code is a hex literal, not
 * prose, and must be read and transcribed left to right in both languages.
 * The grouping is visual only — `aria-label` and the clipboard both carry the
 * original unbroken string, so a screen reader and a paste get the real code.
 *
 * `focusCopy` moves focus to the copy control when the code appears because of
 * something the reader just did elsewhere on the card: the control that had
 * focus is gone, and copying is the next step.
 */
export function InviteCode({
  code,
  className,
  focusCopy = false,
}: {
  code: string;
  className?: string;
  focusCopy?: boolean;
}) {
  const { t } = useI18n();
  const groups = code.match(/.{1,4}/g) ?? [code];
  return (
    <div className={cn("mt-3 p-3", ui.radius.card, ui.surface.page, className)}>
      <p className={cn(ui.text.label, ui.tone.muted)}>{t("fpl.invite_code")}</p>
      <div className="mt-1 flex items-start gap-2">
        <code
          dir="ltr"
          aria-label={code}
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
        </code>
        <UiButton
          size="sm"
          variant="soft"
          aria-label={t("fantasy.leagues.copy_code")}
          className="shrink-0"
          autoFocus={focusCopy}
          onClick={() => {
            void navigator.clipboard?.writeText(code);
            toast.success(t("fpl.copied"));
          }}
        >
          <Copy className="h-4 w-4" aria-hidden />
          {t("fpl.copy")}
        </UiButton>
      </div>
      <p className={cn("mt-2", ui.text.meta, ui.tone.muted)}>{t("fantasy.leagues.invite_help")}</p>
      <p className={cn("mt-1", ui.text.meta, ui.tone.muted)}>
        {t("fantasy.leagues.code_shown_once")}
      </p>
    </div>
  );
}
