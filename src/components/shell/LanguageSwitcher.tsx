import { Languages } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { ui, UiMenu, UiMenuItem } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * `tone` says which surface the trigger is sitting on.
 *
 * The switcher appears in the light top bar AND on the dark mesh behind the
 * welcome and auth screens. Styled once for the top bar, it arrives on the
 * mesh as a pale grey pill — legible, but visibly a piece of another screen.
 * An explicit prop rather than a silent retune: changing the default would
 * restyle four call sites at once, three of which are correct as they are.
 */
export function LanguageSwitcher({ tone = "onSurface" }: { tone?: "onSurface" | "onMesh" } = {}) {
  const { lang, setLanguage, t } = useI18n();
  const onMesh = tone === "onMesh";
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
            onMesh ? ui.surface.mesh : ui.surface.sunken,
            ui.text.meta,
            "[font-weight:var(--ui-weight-heavy)]",
            onMesh ? ui.focusOnMesh : ui.focus,
            // BG-0083: `--ui-ink` is a FILL. As a foreground it is a dark navy
            // in both themes, which measured 1.25:1 on a dark surface. The
            // brand foreground is `--ui-ink-fg`. Spelled out in full rather
            // than built from `ui.tone.ink`, because Tailwind scans for
            // literal class strings and never sees a concatenated one.
            !onMesh && "hover:text-[color:var(--ui-ink-fg)]",
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
