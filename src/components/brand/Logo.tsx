import colorWordmark from "@/assets/brand/botolago-wordmark-color.svg";

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
        width={1024}
        height={1024}
        decoding="async"
        className={`h-9 w-9 rounded-xl object-cover ring-1 ring-white/20 ${className ?? ""}`}
      />
    );
  }
  return (
    <div className={`flex items-center ${className ?? ""}`} aria-label="BotolaGO">
      <img
        src={colorWordmark}
        alt="BotolaGO"
        width={1615}
        height={288}
        decoding="async"
        fetchPriority="high"
        className="h-8 max-w-full w-auto select-none object-contain"
        draggable={false}
      />
    </div>
  );
}
