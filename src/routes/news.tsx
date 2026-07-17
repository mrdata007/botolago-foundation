import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { botolaService } from "@/services/mock";
import { AppShell } from "@/components/shell/AppShell";
import { ArticleCard } from "@/components/common/ArticleCard";
import { LoadingState, EmptyState } from "@/components/common/States";
import { useI18n } from "@/i18n/provider";
import type { ArticleCategory } from "@/types/domain";
import type { TranslationKey } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/news")({
  head: () => ({
    meta: [
      { title: "Actualités — BotolaGO" },
      { name: "description", content: "Toute l'actualité du football marocain : Botola Pro, mercato, analyses et interviews." },
      { property: "og:title", content: "Actualités — BotolaGO" },
      { property: "og:description", content: "Toute l'actualité du football marocain : Botola Pro, mercato, analyses et interviews." },
    ],
  }),
  component: NewsPage,
});

const tabs: { key: ArticleCategory; label: TranslationKey }[] = [
  { key: "for_you", label: "news.tab.for_you" },
  { key: "latest", label: "news.tab.latest" },
  { key: "transfers", label: "news.tab.transfers" },
  { key: "analysis", label: "news.tab.analysis" },
  { key: "interviews", label: "news.tab.interviews" },
];

function NewsPage() {
  const { t, tr } = useI18n();
  const [tab, setTab] = useState<ArticleCategory>("for_you");
  const [clubFilter, setClubFilter] = useState<string | null>(null);
  const [followed, setFollowed] = useState<Record<string, boolean>>({});

  const articlesQ = useQuery({ queryKey: ["articles", tab], queryFn: () => botolaService.getArticles({ category: tab }) });
  const clubsQ = useQuery({ queryKey: ["clubs"], queryFn: () => botolaService.getClubs() });
  const leadQ = useQuery({ queryKey: ["lead"], queryFn: () => botolaService.getLeadArticle() });

  const filtered = useMemo(() => {
    const list = articlesQ.data ?? [];
    if (!clubFilter) return list;
    return list.filter((a) => a.clubIds.includes(clubFilter));
  }, [articlesQ.data, clubFilter]);

  return (
    <AppShell>
      <h1 className="pt-2 text-2xl font-black tracking-tight text-foreground">{t("news.title")}</h1>

      {/* Tabs */}
      <div className="sticky top-[var(--topbar-h)] z-20 -mx-3 mt-3 px-3 pb-2 pt-1">
        <div className="glass-surface glass-strong flex items-center gap-1 overflow-x-auto rounded-2xl border border-[var(--glass-border)] p-1">
          {tabs.map((it) => (
            <button
              key={it.key}
              onClick={() => setTab(it.key)}
              className={cn(
                "shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors",
                tab === it.key
                  ? "bg-[var(--brand-primary)] text-white shadow"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={tab === it.key}
            >
              {t(it.label)}
            </button>
          ))}
        </div>
      </div>

      {/* Lead */}
      {leadQ.data && <div className="mt-3">
        <ArticleCard article={leadQ.data} variant="lead" />
      </div>}

      {/* Club filters */}
      <div className="mt-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("news.filter_clubs")}
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterChip active={clubFilter === null} onClick={() => setClubFilter(null)}>
            {t("news.filter_all")}
          </FilterChip>
          {clubsQ.data?.map((c) => (
            <FilterChip
              key={c.id}
              active={clubFilter === c.id}
              onClick={() => setClubFilter(clubFilter === c.id ? null : c.id)}
              trailing={
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFollowed((f) => ({ ...f, [c.id]: !f[c.id] }));
                  }}
                  className={cn(
                    "ms-1 rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide",
                    followed[c.id] ? "bg-[color:var(--brand-accent)] text-white" : "bg-muted text-muted-foreground",
                  )}
                >
                  {followed[c.id] ? t("news.following") : t("news.follow")}
                </button>
              }
            >
              {tr(c.shortName)}
            </FilterChip>
          ))}
        </div>
      </div>

      {/* Article list */}
      <div className="mt-4 grid gap-3">
        {articlesQ.isLoading && <LoadingState />}
        {!articlesQ.isLoading && filtered.length === 0 && <EmptyState />}
        {filtered.map((a) => (
          <ArticleCard key={a.id} article={a} />
        ))}
      </div>
    </AppShell>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  trailing,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
        active
          ? "border-[color:var(--brand-accent)] bg-[color:var(--brand-accent)] text-white"
          : "border-[var(--glass-border)] bg-white/50 text-foreground hover:bg-white/70",
      )}
    >
      <span>{children}</span>
      {trailing}
    </button>
  );
}
