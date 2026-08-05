import { Shirt } from "lucide-react";

import { ClubCrest } from "@/components/common/ClubCrest";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";

export function AtlasTeamShirt({
  club,
  className,
  logoClassName,
}: {
  club?: Club | null;
  className?: string;
  logoClassName?: string;
}) {
  return (
    <div className={cn("relative grid h-52 w-52 place-items-center sm:h-64 sm:w-64", className)}>
      <Shirt
        className="h-full w-full drop-shadow-[0_24px_34px_rgb(0_0_0/0.35)]"
        strokeWidth={0.85}
        color={club?.primaryColor ?? "#2d7ff9"}
        aria-hidden
      />
      <img
        src="/favicon.png"
        alt="BotolaGO"
        width={64}
        height={64}
        className={cn(
          "absolute top-[40%] h-12 w-12 rounded-2xl bg-white/95 object-contain p-1 shadow-lg sm:h-14 sm:w-14",
          logoClassName,
        )}
      />
      {club && (
        <span className="absolute end-[22%] top-[27%] rounded-full bg-white p-1 shadow-lg">
          <ClubCrest club={club} size="sm" className="h-8 w-8 rounded-full shadow-none" />
        </span>
      )}
    </div>
  );
}
