import { useI18n } from "@/i18n/provider";
import { Logo } from "@/components/brand/Logo";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { LanguageSwitcher } from "@/components/shell/LanguageSwitcher";
import { PageBackground } from "@/components/shell/PageBackground";

interface Props {
  onStart: () => void;
  onSignIn: () => void;
}

export function WelcomeScreen({ onStart, onSignIn }: Props) {
  const { t, dir } = useI18n();
  const Arrow = dir === "rtl" ? ArrowLeft : ArrowRight;

  return (
    <div
      className="relative min-h-[100dvh] w-full overflow-hidden text-white motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500"
      style={{
        background:
          "linear-gradient(160deg, oklch(0.20 0.08 262) 0%, oklch(0.28 0.10 258) 45%, oklch(0.42 0.16 256) 100%)",
      }}
    >
      {/* Decorative football-inspired arcs / bands */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.14]"
        viewBox="0 0 400 800"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="wArc" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="120" r="220" fill="none" stroke="url(#wArc)" strokeWidth="1.5" />
        <circle cx="60" cy="120" r="300" fill="none" stroke="url(#wArc)" strokeWidth="1" />
        <circle cx="360" cy="700" r="260" fill="none" stroke="url(#wArc)" strokeWidth="1.2" />
        <path
          d="M -20 620 Q 200 520 420 640"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.08"
          strokeWidth="60"
          strokeLinecap="round"
        />
        <path
          d="M -20 680 Q 200 600 420 700"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.05"
          strokeWidth="40"
          strokeLinecap="round"
        />
      </svg>

      {/* Radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
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

          <h1 className="mt-8 text-3xl font-black leading-tight tracking-tight sm:text-4xl">
            {t("welcome.title")}
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-[15px] leading-relaxed text-white/80">
            {t("welcome.description")}
          </p>
        </div>

        <div className="flex-1" />

        <div className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4 motion-safe:duration-700">
          <button
            type="button"
            onClick={onStart}
            className="group flex min-h-[54px] w-full items-center justify-center gap-2 rounded-[18px] bg-white px-6 text-base font-bold text-[color:var(--brand-primary)] shadow-lg shadow-black/30 transition-transform hover:-translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 active:translate-y-0"
          >
            <span>{t("welcome.cta_primary")}</span>
            <Arrow className="h-5 w-5 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" aria-hidden />
          </button>

          <p className="mt-5 text-center text-sm text-white/70">
            {t("welcome.secondary_prompt")}
          </p>

          <button
            type="button"
            onClick={onSignIn}
            className="group mt-3 flex min-h-[54px] w-full items-center justify-center gap-2 rounded-[18px] border border-white/20 bg-white/10 px-6 text-base font-bold text-white backdrop-blur-md transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" }}
          >
            <span>{t("welcome.cta_secondary")}</span>
            <Arrow className="h-5 w-5 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
