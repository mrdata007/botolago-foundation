import { Languages } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function LanguageSwitcher() {
  const { lang, setLanguage, t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          // The trigger sits in the top bar next to the nav links, so it
          // carries the same kit vocabulary they do rather than a V2 glass
          // pill: sunken surface, kit radius, kit meta type, 44px tap floor.
          "inline-flex items-center justify-center gap-1.5 px-2.5 transition-colors",
          ui.space.tap,
          ui.radius.control,
          ui.surface.sunken,
          ui.text.meta,
          "[font-weight:var(--ui-weight-heavy)]",
          ui.focus,
          "hover:text-[color:var(--ui-ink)]",
        )}
        aria-label={t("language.switch")}
      >
        <Languages className="h-4 w-4" aria-hidden />
        <span>{lang === "fr" ? "FR" : "ع"}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[9rem]">
        <DropdownMenuItem onClick={() => setLanguage("fr")} className="justify-between">
          <span>Français</span>
          {lang === "fr" && <span aria-hidden>•</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLanguage("ar")} className="justify-between">
          <span>العربية</span>
          {lang === "ar" && <span aria-hidden>•</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
