interface LogoProps {
  variant?: "full" | "icon";
  className?: string;
}

export function Logo({ variant = "full", className }: LogoProps) {
  if (variant === "icon") {
    return (
      <img
        src="/favicon.png"
        alt="BotolaGO"
        className={`h-9 w-9 rounded-xl object-cover ring-1 ring-white/20 ${className ?? ""}`}
      />
    );
  }
  return (
    <div className={`inline-flex items-center gap-2 ${className ?? ""}`} aria-label="BotolaGO">
      <img
        src="/favicon.png"
        alt=""
        aria-hidden="true"
        className="h-8 w-8 select-none rounded-lg object-cover ring-1 ring-border/50"
        draggable={false}
      />
      <span className="text-lg font-black tracking-tight text-foreground">
        Botola<span className="text-brand">GO</span>
      </span>
    </div>
  );
}
