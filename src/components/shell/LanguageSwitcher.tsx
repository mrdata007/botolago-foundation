import { Languages } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { ui, UiIconButton, UiMenu, UiMenuItem } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * `tone` says which surface the trigger is sitting on.
 *
 * The switcher appears in the light top bar (and the Profile language row)
 * AND on the dark mesh behind the welcome and auth screens. Styled once for
 * the top bar, it arrives on the mesh as a pale grey pill — legible, but
 * visibly a piece of another screen. An explicit prop rather than a silent
 * retune: changing the default would restyle four call sites at once, three
 * of which are correct as they are.
 *
 * Option A: on a surface the trigger is the round 44px soft button the top
 * bar is built from (`UiIconButton variant="soft"`), carrying only the
 * current language — "FR" or "ع" — in heavy meta type, as the boards draw it.
 * The glyph is gone from it; the button's name still says what it does. On
 * the mesh it keeps the glyph and the glass plate, rounded like every other
 * control.
 */
export function LanguageSwitcher({ tone = "onSurface" }: { tone?: "onSurface" | "onMesh" } = {}) {
  const { lang, setLanguage, t } = useI18n();
  const current = lang === "fr" ? "FR" : "ع";
  const trigger =
    tone === "onMesh" ? (
      <button
        type="button"
        className={cn(
          "inline-flex items-center justify-center gap-1.5 px-3 transition-colors",
          ui.space.tap,
          ui.radius.full,
          ui.surface.mesh,
          ui.text.meta,
          "[font-weight:var(--ui-weight-heavy)]",
          ui.focusOnMesh,
        )}
        aria-label={t("language.switch")}
      >
        <Languages className="h-4 w-4" aria-hidden />
        <span>{current}</span>
      </button>
    ) : (
      <UiIconButton
        aria-label={t("language.switch")}
        className={cn(ui.text.meta, "[font-weight:var(--ui-weight-heavy)]")}
      >
        {current}
      </UiIconButton>
    );

  return (
    <UiMenu label={t("language.switch")} trigger={trigger}>
      <UiMenuItem onSelect={() => setLanguage("fr")} selected={lang === "fr"}>
        Français
      </UiMenuItem>
      <UiMenuItem onSelect={() => setLanguage("ar")} selected={lang === "ar"}>
        العربية
      </UiMenuItem>
    </UiMenu>
  );
}
