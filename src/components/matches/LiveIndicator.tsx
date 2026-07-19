import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/provider";

/**
 * Design System V2 — Live indicator.
 *
 * Restrained, premium urgency: a soft pulsing dot next to the LIVE label.
 * The pulse is CSS-only and disabled under prefers-reduced-motion.
 * Never used with aggressive red flashing — the token `--color-live` is
 * a calm brand-red tuned for legibility on light and glass surfaces.
 */
export function LiveIndicator({
  minute,
  size = "sm",
  className,
}: {
  minute?: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const { t } = useI18n();
  const label = t("matches.status.live");
  const sizes = size === "md" ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-0.5 text-[10px]";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-black uppercase tracking-[0.14em]",
        "bg-[color:color-mix(in_oklab,var(--color-live)_14%,transparent)] text-[color:var(--color-live)]",
        sizes,
        className,
      )}
    >
      <span className="relative inline-flex h-1.5 w-1.5 items-center justify-center" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--color-live)] opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[color:var(--color-live)]" />
      </span>
      <span>{label}</span>
      {typeof minute === "number" && <span className="tabular-nums">{minute}′</span>}
    </span>
  );
}
