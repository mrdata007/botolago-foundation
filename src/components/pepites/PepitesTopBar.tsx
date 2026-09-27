import { Link } from "@tanstack/react-router";
import { UserRound } from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { LanguageSwitcher } from "@/components/shell/LanguageSwitcher";
import { PrimaryNavLinks } from "@/components/shell/TopBar";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { initials, pp } from "./pepites-design";
import { GoMark } from "./PepitesVisuals";

/**
 * The top of every Pépites page (Figma 01–04): the night bar with the
 * "GO · Pépites · DATA" mark, the language, and the reader's avatar, which
 * opens the profile (Pépites took Profil's place in the bottom bar). On a
 * wide screen the primary links sit in the middle, as in the global bar.
 */
export function PepitesTopBar() {
  const { t } = useI18n();
  const { user } = useAuth();
  const name = user?.displayName?.trim() || user?.username?.trim() || "";
  return (
    <header
      className={cn("sticky top-0 z-30", pp.night, ui.safe.top, "pb-2")}
      data-testid="pepites-topbar"
    >
      <div
        className={cn(
          "mx-auto flex min-h-[var(--ui-tap-min)] items-center gap-3 md:max-w-[var(--ui-content-max)]",
          ui.space.gutter,
        )}
      >
        <GoMark />
        <PrimaryNavLinks tone="night" />
        <div className="ms-auto flex items-center gap-2 md:ms-0">
          <LanguageSwitcher tone="onMesh" />
          <Link
            to="/profile"
            aria-label={t("nav.profile")}
            data-testid="pepites-avatar"
            className={cn(
              "inline-flex items-center justify-center rounded-full",
              ui.space.tap,
              ui.focusOnMesh,
            )}
          >
            <span
              aria-hidden
              className={cn(
                "inline-flex size-[30px] items-center justify-center rounded-full border-[1.5px] border-white/35 bg-white/10 text-[10px] text-white",
                pp.heavy,
              )}
            >
              {name ? initials(name) : <UserRound className="size-4" />}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
