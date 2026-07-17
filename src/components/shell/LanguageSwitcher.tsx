import { Languages } from "lucide-react";
import { useI18n } from "@/i18n/provider";
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
        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--glass-border)] bg-white/40 px-2.5 py-1.5 text-xs font-semibold text-foreground backdrop-blur transition-colors hover:bg-white/60"
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
