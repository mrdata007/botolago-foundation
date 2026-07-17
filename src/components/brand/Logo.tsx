// Placeholder logo slot for BotolaGO.
// The user will provide the official logo & icon assets — drop them at
// `public/brand/logo.svg` and `public/brand/icon.svg` and this component
// will render them automatically. Until then, a neutral typographic mark
// is shown so no invented visual identity leaks into the UI.

interface LogoProps {
  variant?: "full" | "icon";
  className?: string;
}

export function Logo({ variant = "full", className }: LogoProps) {
  if (variant === "icon") {
    return (
      <div
        className={`grid h-9 w-9 place-items-center rounded-xl bg-[var(--bg-brand-gradient)] text-white font-black text-sm tracking-tight ring-1 ring-white/20 ${className ?? ""}`}
        aria-label="BotolaGO"
        data-brand-placeholder="icon"
      >
        BG
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`} data-brand-placeholder="full">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--bg-brand-gradient)] text-white font-black text-sm tracking-tight ring-1 ring-white/20">
        BG
      </div>
      <span className="text-lg font-black tracking-tight text-foreground">
        Botola<span className="text-[color:var(--brand-accent)]">GO</span>
      </span>
    </div>
  );
}
