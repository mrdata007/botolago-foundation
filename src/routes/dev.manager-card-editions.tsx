import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect } from "react";

import { CARD_EDITIONS } from "@/backend/manager-card/contracts";
import { CardToken } from "@/components/manager-card/CardToken";
import { ManagerCard } from "@/components/manager-card/ManagerCard";
import type { CardEdition, CardProfile, TierCode } from "@/components/manager-card/types";
import { useI18n } from "@/i18n/provider";

/**
 * A SAMPLE sheet of the card editions (BotolaGO+), for looking at them and for the screenshots in
 * the pull request: every edition at one tier, large, with its tokens under it. Development
 * servers only: anywhere else this route is "not found". Everything on it is invented.
 *
 *   ?lang=fr|ar   ?tier=none|homa|stade|pro|champion|legend   ?width=px (default 260)
 *   ?name=...     ?tilt=1 (the pointer's tilt)
 */
type Search = { lang?: "fr" | "ar"; tier?: string; width?: number; name?: string; tilt?: boolean };

const TIERS = ["none", "homa", "stade", "pro", "champion", "legend"] as const;

export const Route = createFileRoute("/dev/manager-card-editions")({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(search.lang === "ar" || search.lang === "fr" ? { lang: search.lang } : {}),
    ...(typeof search.tier === "string" && (TIERS as readonly string[]).includes(search.tier)
      ? { tier: search.tier }
      : {}),
    ...(Number(search.width) >= 100 && Number(search.width) <= 700
      ? { width: Number(search.width) }
      : {}),
    ...(typeof search.name === "string" && search.name.trim()
      ? { name: search.name.trim().slice(0, 40) }
      : {}),
    ...(search.tilt === true || search.tilt === "1" || search.tilt === 1 ? { tilt: true } : {}),
  }),
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: Sheet,
});

const OVR: Record<string, number> = {
  homa: 58,
  stade: 66,
  pro: 76,
  champion: 86,
  legend: 95,
};

function profileFor(
  tier: string,
  edition: CardEdition,
  name: string,
  lang: "fr" | "ar",
): CardProfile {
  const t = tier === "none" ? null : (tier as TierCode);
  return {
    name,
    ovr: t ? OVR[t]! : null,
    tier: t,
    provisional: false,
    counted: t ? 6 : 1,
    minRated: 3,
    season: "2026/27",
    serial: "004821",
    founder: null,
    club: {
      id: "sample-club",
      initials: "WAC",
      name: { fr: "Wydad AC", ar: "الوداد الرياضي" },
      primary: lang === "ar" ? "#c8102e" : "#c8102e",
      secondary: "#ffffff",
    },
    stats: t
      ? { cap: 76, sel: 72, trf: 68, con: 74 }
      : { cap: null, sel: null, trf: null, con: null },
    statsKnown: true,
    sample: true,
    ...(edition === "standard" ? {} : { edition }),
  };
}

function Sheet() {
  const search = Route.useSearch();
  const { setLanguage, lang, dir } = useI18n();
  const wanted = search.lang ?? "fr";
  useEffect(() => {
    if (lang !== wanted) setLanguage(wanted);
  }, [lang, wanted, setLanguage]);
  const tier = search.tier ?? "pro";
  const name = search.name ?? (wanted === "ar" ? "كريم بوطيب" : "Karim Boutaib");
  const width = search.width ?? 260;
  return (
    <div dir={dir} className="min-h-dvh bg-[#0b1018] p-4 text-white" data-testid="editions-root">
      <div className="flex flex-wrap gap-6" data-testid="editions-cards">
        {CARD_EDITIONS.map((edition) => (
          <div key={edition} className="flex flex-col items-center gap-3" data-edition={edition}>
            <ManagerCard
              profile={profileFor(tier, edition, name, wanted)}
              width={width}
              tilt={search.tilt}
              testId={`edition-${edition}`}
            />
            <div className="flex items-center gap-2" data-testid={`tokens-${edition}`}>
              {([80, 56, 44, 32, 24] as const).map((size) => (
                <CardToken
                  key={size}
                  profile={profileFor(tier, edition, name, wanted)}
                  size={size}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
