import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";

import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { Language } from "@/types/domain";

/**
 * The two languages inside a `UiMenu`: the top bar's switcher and the Profile
 * language row both open this.
 *
 * Radio items, not `UiMenuItem`s (audit 2026-09-25, A12, applied to every
 * language control, not only the first-launch chooser). A `UiMenuItem` marks
 * the current choice with `aria-current`, which suits a menu of places; a
 * choice of one language out of two is what `menuitemradio` is for, and
 * Radix gives it `aria-checked`, the arrow keys and the tick's placement for
 * free. The row is drawn exactly like `UiMenuItem` — the kit's 44px row, the
 * control radius, the sunken highlight that is also the keyboard focus cue,
 * ink for the chosen row — so the menu looks as it did.
 *
 * The value is the language on screen, not the one asked for: while Arabic
 * is still loading (or failed to), the page is French and the tick says so.
 * Choosing Arabic again from here is a retry.
 */
export function LanguageMenuChoices() {
  const { lang, setLanguage, t } = useI18n();
  const choices: { code: Language; label: string }[] = [
    { code: "fr", label: t("language.french") },
    { code: "ar", label: t("language.arabic") },
  ];
  return (
    <Menu.RadioGroup value={lang} onValueChange={(value) => setLanguage(value as Language)}>
      {choices.map(({ code, label }) => (
        <Menu.RadioItem
          key={code}
          value={code}
          // Each name is written in its own language (an endonym), so a
          // screen reader should read it with that language's voice.
          lang={code}
          className={cn(
            "flex w-full cursor-pointer select-none items-center justify-between gap-3 px-3 outline-none",
            ui.space.row,
            ui.radius.control,
            ui.text.body,
            ui.tone.default,
            "data-[highlighted]:bg-[color:var(--ui-surface-sunken)]",
            lang === code && ui.tone.ink,
          )}
        >
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <Menu.ItemIndicator>
            <Check className="h-4 w-4 shrink-0" aria-hidden />
          </Menu.ItemIndicator>
        </Menu.RadioItem>
      ))}
    </Menu.RadioGroup>
  );
}
