import { Languages } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { ui, UiMenu, UiMenuItem } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const { lang, setLanguage, t } = useI18n();
  return (
    <UiMenu
      label={t("language.switch")}
      trigger={
        <button
          type="button"
          className={cn(
            // The trigger sits in the top bar next to the nav links, so it
            // carries the same kit vocabulary they do rather than a V2 glass
            // pill: sunken surface, kit radius, kit meta type, 44px tap floor.
            "inline-flex items-center justify-center gap-1.5 px-2.5 transition-colors",
            ui.space.tap,
            ui.radius.control,
            ui.surface.sunken,
            ui.text.meta,
            "[font-weight:var(--ui-weight-heavy)]",
            ui.focus,
            // BG-0083: `--ui-ink` is a FILL. As a foreground it is a dark navy
            // in both themes, which measured 1.25:1 on a dark surface. The
            // brand foreground is `--ui-ink-fg`. Spelled out in full rather
            // than built from `ui.tone.ink`, because Tailwind scans for
            // literal class strings and never sees a concatenated one.
            "hover:text-[color:var(--ui-ink-fg)]",
          )}
          aria-label={t("language.switch")}
        >
          <Languages className="h-4 w-4" aria-hidden />
          <span>{lang === "fr" ? "FR" : "ع"}</span>
        </button>
      }
    >
      <UiMenuItem onSelect={() => setLanguage("fr")} selected={lang === "fr"}>
        Français
      </UiMenuItem>
      <UiMenuItem onSelect={() => setLanguage("ar")} selected={lang === "ar"}>
        العربية
      </UiMenuItem>
    </UiMenu>
  );
}
