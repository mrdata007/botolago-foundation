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
        // Kit radius and a hairline from the rule token; the V2 `rounded-xl`
        // + `ring-white/20` only read correctly on a dark chrome.
        className={`h-9 w-9 rounded-[var(--ui-radius-control)] object-cover ring-1 ring-[color:var(--ui-rule)] ${className ?? ""}`}
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
