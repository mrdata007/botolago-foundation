import { ui } from "@/components/ui-kit";
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
 * visual register from the app surface behind it. That register stays — white
 * on a mesh gradient is correct here and the kit's colour tokens are built for
 * the light app page, not for a hero.
 *
 * What did NOT need to be different is the type. This screen carried six sizes
 * on no scale (`text-3xl`, `text-4xl`, `text-base`, `text-sm`, `text-[15px]`,
 * `text-[11px]`) and two literal leadings. Four of the six map to ramp steps at
 * the IDENTICAL pixel value — 16, 14, 15 and 11 — so they are now drawn from
 * the ramp and nothing moves in French. The leadings matter more: a literal
 * carries no Arabic adjustment, and this screen is the first thing an Arabic
 * visitor sees (BG-0124).
 *
 * `text-3xl`/`sm:text-4xl` on the title stay as they are: the nearest ramp step
 * is `--ui-text-hero` at 34px, which is a real 4px change to the one piece of
 * type this screen is built around. Not worth taking unasked.
 */

export function WelcomeScreen({ onSignIn, onGuest }: Props) {
  const { t, dir } = useI18n();
  const Arrow = dir === "rtl" ? ArrowLeft : ArrowRight;

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden text-white motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500">
      <PageBackground variant="auth" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 40% at 50% 15%, rgba(255,255,255,0.18), transparent 70%)",
        }}
      />

      <div
        className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6"
        style={{
          paddingTop: "max(env(safe-area-inset-top), 1.5rem)",
          paddingBottom: "max(env(safe-area-inset-bottom), 1.5rem)",
        }}
      >
        <div className="flex items-center justify-end">
          <LanguageSwitcher />
        </div>

        <div className="mt-10 flex flex-col items-center text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-700">
          <div
            className="grid h-24 w-24 place-items-center rounded-3xl bg-white/10 p-3 ring-1 ring-white/20 backdrop-blur-md motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-500"
            style={{ boxShadow: "0 20px 60px -20px rgba(0,0,0,0.6)" }}
          >
            <Logo variant="icon" className="!h-16 !w-16 !rounded-2xl" />
          </div>

          <h1 className="mt-8 text-3xl font-black leading-[var(--ui-leading-flat)] ltr:tracking-tight sm:text-4xl">
            {t("welcome.title")}
          </h1>
          <p className={cn("mx-auto mt-4 max-w-sm text-white/80", ui.text.prose)}>
            {t("welcome.description")}
          </p>
        </div>

        <div className="flex-1" />

        <div className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4 motion-safe:duration-700">
          <button
            type="button"
            onClick={onGuest}
            className="group flex min-h-[54px] w-full items-center justify-center gap-2 rounded-[var(--ui-radius-sheet)] bg-white px-6 text-[length:var(--ui-text-subtitle)] font-bold text-[color:var(--brand-primary)] shadow-lg shadow-black/30 transition-transform hover:-translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 active:translate-y-0"
          >
            <span>{t("welcome.cta_primary")}</span>
            <Arrow
              className="h-5 w-5 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5"
              aria-hidden
            />
          </button>

          <p className="mt-5 text-center text-[length:var(--ui-text-secondary)] text-white/70">
            {t("welcome.secondary_prompt")}
          </p>

          <button
            type="button"
            onClick={onSignIn}
            className="group mt-3 flex min-h-[54px] w-full items-center justify-center gap-2 rounded-[var(--ui-radius-sheet)] border border-white/20 bg-white/10 px-6 text-[length:var(--ui-text-subtitle)] font-bold text-white backdrop-blur-md transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" }}
          >
            <span>{t("welcome.cta_secondary")}</span>
            <Arrow
              className="h-5 w-5 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5"
              aria-hidden
            />
          </button>

          <button
            type="button"
            onClick={onGuest}
            // `min-h-[var(--ui-tap-min)]` — this was a 20px-tall hit area, the
            // only way past the sign-up wall, and the first control a new
            // visitor ever taps. The rest of this screen is still on the
            // Design System V2 dark hero (see the note at the top of the
            // file); raising the tap target does not depend on that.
            className="mt-4 inline-flex min-h-[var(--ui-tap-min)] w-full items-center justify-center text-center text-[length:var(--ui-text-secondary)] font-semibold text-white/75 underline-offset-4 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            {t("welcome.cta_guest")}
          </button>
          <p className={cn("mt-1 text-center text-white/55", ui.text.micro)}>
            {t("welcome.guest_hint")}
          </p>
        </div>
      </div>
    </div>
  );
}
