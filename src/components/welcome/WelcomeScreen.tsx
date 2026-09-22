import { ui, UiButton } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/provider";
import { Logo } from "@/components/brand/Logo";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { LanguageSwitcher } from "@/components/shell/LanguageSwitcher";
import { PageBackground } from "@/components/shell/PageBackground";

interface Props {
  onSignIn: () => void;
  onGuest: () => void;
}

/**
 * The onboarding splash: a full-bleed dark hero, deliberately a different
 * visual register from the app surface behind it.
 *
 * That register stays. What changed is that it is no longer this file's
 * private invention. An earlier version of this comment argued that "the kit's
 * colour tokens are built for the light app page, not for a hero", and that
 * was true when it was written — so this screen reached for `text-white/80`,
 * `bg-white/10`, `ring-white/20` and three `rgba()` literals, and AuthShell
 * separately reached for the same thing in `color-mix` form. Two files, one
 * decision, two spellings.
 *
 * The mesh register is now tokens: `ui.tone.onMesh` and its muted and faint
 * steps, `ui.surface.mesh` for the glass tile, `ui.focusOnMesh` for a ring
 * that is visible on a dark surface, and `tone="onMesh"` on the kit's buttons.
 * Every colour here is one of those, and they all follow the theme.
 *
 * The type moved too. This screen carried six sizes on no scale; the title's
 * `text-3xl`/`sm:text-4xl` is now `ui.text.hero` (34px), which is a 4px change
 * at phone width and puts the one piece of type this screen is built around on
 * the same ramp as the rest of the product.
 */

export function WelcomeScreen({ onSignIn, onGuest }: Props) {
  const { t, dir } = useI18n();
  // A transform has no logical form, so the arrow is chosen rather than
  // mirrored — and the `rtl:` pair on its hover travel goes with it.
  const Arrow = dir === "rtl" ? ArrowLeft : ArrowRight;

  return (
    <div
      className={cn(
        "relative min-h-[100dvh] w-full overflow-hidden",
        ui.tone.onMesh,
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500",
      )}
    >
      {/* `variant="auth"` is explicit because this renders at `/`, where the
          resolver would otherwise paint the light page and every foreground
          on this screen would vanish. */}
      <PageBackground variant="auth" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 40% at 50% 15%, color-mix(in oklab, var(--ui-on-ink-plain) 18%, transparent), transparent 70%)",
        }}
      />

      <div
        className={cn(
          "relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[var(--ui-column-max)] flex-col",
          ui.space.gutter,
          ui.safe.top,
          ui.safe.bottom,
        )}
      >
        <div className="flex items-center justify-end">
          <LanguageSwitcher tone="onMesh" />
        </div>

        <div className="mt-10 flex flex-col items-center text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-700">
          <div
            className={cn(
              "grid h-24 w-24 place-items-center p-3",
              ui.radius.sheet,
              ui.surface.mesh,
              "motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-500",
            )}
          >
            <Logo variant="icon" className="!h-16 !w-16 !rounded-[var(--ui-radius-sheet)]" />
          </div>

          <h1 className={cn("mt-8", ui.text.hero, "ltr:tracking-tight")}>{t("welcome.title")}</h1>
          <p className={cn("mx-auto mt-4 max-w-[36ch]", ui.text.prose, ui.tone.onMeshMuted)}>
            {t("welcome.description")}
          </p>
        </div>

        <div className="flex-1" />

        <div className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4 motion-safe:duration-700">
          <UiButton
            variant="light"
            tone="onMesh"
            onClick={onGuest}
            className="group transition-transform hover:-translate-y-px active:translate-y-0"
          >
            <span>{t("welcome.cta_primary")}</span>
            <Arrow
              className="h-5 w-5 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5"
              aria-hidden
            />
          </UiButton>

          <p className={cn("mt-5 text-center", ui.text.secondary, ui.tone.onMeshMuted)}>
            {t("welcome.secondary_prompt")}
          </p>

          <UiButton
            variant="outline"
            tone="onMesh"
            onClick={onSignIn}
            className="group mt-3 transition-colors"
          >
            <span>{t("welcome.cta_secondary")}</span>
            <Arrow
              className="h-5 w-5 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5"
              aria-hidden
            />
          </UiButton>

          {/*
            A text link in button clothing, not a kit button — and the only way
            past the sign-up wall, which is why it carries a real tap floor
            rather than the 20px hit area it once had. It calls `onGuest` like
            the primary CTA above: not a duplicate, the documented bypass.
          */}
          <button
            type="button"
            onClick={onGuest}
            className={cn(
              "mt-4 inline-flex w-full items-center justify-center text-center underline-offset-4",
              ui.space.tap,
              ui.text.secondary,
              ui.tone.onMeshMuted,
              "hover:text-[color:var(--ui-on-mesh)] hover:underline",
              ui.focusOnMesh,
            )}
          >
            {t("welcome.cta_guest")}
          </button>
          <p className={cn("mt-1 text-center", ui.text.micro, ui.tone.onMeshFaint)}>
            {t("welcome.guest_hint")}
          </p>
        </div>
      </div>
    </div>
  );
}
