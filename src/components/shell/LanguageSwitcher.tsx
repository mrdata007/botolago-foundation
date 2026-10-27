import { Languages } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { ui, UiIconButton, UiMenu } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { LanguageMenuChoices } from "./LanguageMenuChoices";

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
 *
 * `data-language-switcher` is where the Arabic-failure notice hands keyboard
 * focus when it leaves with it (`@/i18n/language-notice-focus`). An attribute
 * rather than an `id`: the menu gives its trigger an id of its own, which
 * names the menu, and there can be more than one switcher on a page.
 */
export function LanguageSwitcher({
  tone = "onSurface",
  direct = false,
}: {
  tone?: "onSurface" | "onMesh";
  /**
   * One tap instead of a menu of two: the button names the OTHER language
   * ("ع" on a French page, "FR" on an Arabic one) and switches to it. The top
   * bar uses it, since a first visit has no chooser and the way into Arabic
   * has to be a single tap; the Profile row keeps the menu.
   */
  direct?: boolean;
} = {}) {
  const { lang, setLanguage, t } = useI18n();
  const current = lang === "fr" ? "FR" : "ع";
  if (direct) {
    const other = lang === "fr" ? "ar" : "fr";
    return (
      <UiIconButton
        aria-label={other === "fr" ? t("language.switch_to_fr") : t("language.switch_to_ar")}
        data-language-switcher=""
        // The label is the target language written in its own script.
        lang={other}
        onClick={() => setLanguage(other)}
        className={cn(ui.text.meta, "[font-weight:var(--ui-weight-heavy)]")}
      >
        {other === "fr" ? "FR" : "ع"}
      </UiIconButton>
    );
  }
  const trigger =
    tone === "onMesh" ? (
      <button
        type="button"
        data-language-switcher=""
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
        data-language-switcher=""
        className={cn(ui.text.meta, "[font-weight:var(--ui-weight-heavy)]")}
      >
        {current}
      </UiIconButton>
    );

  return (
    <UiMenu label={t("language.switch")} trigger={trigger}>
      <LanguageMenuChoices />
    </UiMenu>
  );
}
