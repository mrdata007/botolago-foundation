import logoAsset from "@/assets/botolago-logo.jpg.asset.json";

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
    <div className={`flex items-center ${className ?? ""}`}>
      <img
        src={logoAsset.url}
        alt="BotolaGO"
        className="h-7 w-auto select-none"
        draggable={false}
      />
    </div>
  );
}
