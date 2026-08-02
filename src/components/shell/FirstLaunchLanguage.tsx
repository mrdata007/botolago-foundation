import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { dictionaries } from "@/i18n/dictionaries";
import type { Language } from "@/types/domain";
import { Logo } from "@/components/brand/Logo";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function FirstLaunchLanguage() {
  const { isHydrated, hasChosen, setLanguage } = useI18n();
  const [selected, setSelected] = useState<Language>("fr");
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!isHydrated || hasChosen) return;
    const dialog = dialogRef.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = dialog?.querySelectorAll<HTMLElement>("button:not([disabled])");
    focusable?.[0]?.focus();

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    dialog?.addEventListener("keydown", trapFocus);
    return () => {
      dialog?.removeEventListener("keydown", trapFocus);
      previousFocus?.focus();
    };
  }, [hasChosen, isHydrated]);

  if (!isHydrated || hasChosen) return null;

  const options: { code: Language; native: string; sub: string; dir: "ltr" | "rtl" }[] = [
    { code: "fr", native: "Français", sub: dictionaries.fr["app.tagline"], dir: "ltr" },
    { code: "ar", native: "العربية", sub: dictionaries.ar["app.tagline"], dir: "rtl" },
  ];

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="fixed inset-0 z-50 grid place-items-center bg-[color:var(--brand-primary)]/70 px-4 backdrop-blur-md motion-safe:animate-in motion-safe:fade-in-0"
    >
      <div className="glass-surface glass-strong w-full max-w-md rounded-3xl border border-white/20 p-6 shadow-2xl shadow-black/30">
        <div className="flex items-center justify-center pb-4">
          <Logo />
        </div>
        <h1 id={titleId} className="text-center text-2xl font-black tracking-tight text-foreground">
          {dictionaries.fr["language.choose_title"]}
        </h1>
        <p id={descriptionId} className="mt-1 text-center text-sm text-muted-foreground" dir="rtl">
          {dictionaries.ar["language.choose_title"]}
        </p>

        <div className="mt-6 grid gap-3">
          {options.map((o) => {
            const active = selected === o.code;
            return (
              <button
                key={o.code}
                type="button"
                dir={o.dir}
                onClick={() => setSelected(o.code)}
                aria-pressed={active}
                className={cn(
                  "flex items-center justify-between rounded-2xl border px-4 py-3 text-start transition-all",
                  active
                    ? "border-[color:var(--brand-accent)] bg-white/80 shadow-md"
                    : "border-[var(--glass-border)] bg-white/40 hover:bg-white/60",
                )}
              >
                <div className="min-w-0">
                  <div className="text-base font-bold text-foreground">{o.native}</div>
                  <div className="truncate text-xs text-muted-foreground">{o.sub}</div>
                </div>
                <span
                  className={cn(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors",
                    active
                      ? "border-[color:var(--brand-accent)] bg-[color:var(--brand-accent)] text-white"
                      : "border-[var(--glass-border)] bg-white/60",
                  )}
                  aria-hidden
                >
                  {active && <Check className="h-3.5 w-3.5" />}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setLanguage(selected)}
          className="mt-6 w-full rounded-2xl cta-brand px-4 py-3 text-base font-bold shadow-lg shadow-[color:var(--brand-primary)]/30 transition-transform hover:-translate-y-0.5"
        >
          {selected === "ar"
            ? dictionaries.ar["language.continue"]
            : dictionaries.fr["language.continue"]}
        </button>
      </div>
    </div>
  );
}
