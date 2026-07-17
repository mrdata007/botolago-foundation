import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/shell/AppShell";
import { ClubCrest } from "@/components/common/ClubCrest";
import { SectionHeader } from "@/components/common/SectionHeader";
import { useI18n } from "@/i18n/provider";
import { botolaService } from "@/services/mock";
import { UserCircle } from "lucide-react";
import { LanguageSwitcher } from "@/components/shell/LanguageSwitcher";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profil — BotolaGO" },
      { name: "description", content: "Gérez vos clubs suivis, votre langue et vos préférences BotolaGO." },
      { property: "og:title", content: "Profil — BotolaGO" },
      { property: "og:description", content: "Gérez vos clubs suivis, votre langue et vos préférences BotolaGO." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { t, tr } = useI18n();
  const followedQ = useQuery({ queryKey: ["followed"], queryFn: () => botolaService.getFollowedClubs() });

  return (
    <AppShell>
      <h1 className="pt-2 text-2xl font-black tracking-tight text-foreground">{t("profile.title")}</h1>

      <div className="mt-4 glass-surface glass-strong flex items-center gap-3 rounded-3xl border border-[var(--glass-border)] p-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[var(--bg-brand-gradient)] text-white">
          <UserCircle className="h-8 w-8" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-black text-foreground">BotolaGO Manager</div>
          <div className="truncate text-xs text-muted-foreground">{t("profile.coming_soon")}</div>
        </div>
      </div>

      <SectionHeader title={t("profile.language")} />
      <div className="glass-surface glass-regular flex items-center justify-between rounded-2xl border border-[var(--glass-border)] px-4 py-3">
        <span className="text-sm font-semibold text-foreground">{t("language.switch")}</span>
        <LanguageSwitcher />
      </div>

      <SectionHeader title={t("profile.followed_clubs")} />
      <div className="grid gap-2">
        {followedQ.data?.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-2xl bg-card px-3 py-2 ring-1 ring-black/5">
            <ClubCrest club={c} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-foreground">{tr(c.name)}</div>
              <div className="truncate text-[11px] text-muted-foreground">{tr(c.city)}</div>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
