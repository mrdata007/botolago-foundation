import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { useI18n } from "@/i18n/provider";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/fantasy")({
  head: () => ({
    meta: [
      { title: "Fantasy — BotolaGO" },
      { name: "description", content: "Créez votre équipe fantasy de la Botola Pro et affrontez vos amis." },
      { property: "og:title", content: "Fantasy — BotolaGO" },
      { property: "og:description", content: "Créez votre équipe fantasy de la Botola Pro et affrontez vos amis." },
    ],
  }),
  component: FantasyPage,
});

function FantasyPage() {
  const { t } = useI18n();
  return (
    <AppShell>
      <h1 className="pt-2 text-2xl font-black tracking-tight text-foreground">{t("fantasy.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("fantasy.subtitle")}</p>

      <div className="mt-8 glass-surface glass-strong rounded-3xl border border-[var(--glass-border)] p-8 text-center shadow-lg shadow-black/5">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--bg-brand-gradient)] text-white">
          <Trophy className="h-7 w-7" aria-hidden />
        </div>
        <p className="mt-4 text-base font-bold text-foreground">{t("fantasy.coming_soon")}</p>
      </div>
    </AppShell>
  );
}
