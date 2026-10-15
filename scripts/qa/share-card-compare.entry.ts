import { fullCard } from "__ROOT__/src/components/manager-card/shield/full";
import { cardImage } from "__ROOT__/src/components/manager-card/shield/image";
import { ready } from "__ROOT__/src/components/manager-card/shield/fonts";
import { renderCardShareImage } from "__ROOT__/src/components/manager-card/moments/card-share-image";
import { STRINGS, rated } from "__ROOT__/src/components/manager-card/shield/test-support";

const cases: { label: string; lang: "fr" | "ar"; p: Record<string, unknown> }[] = [
  { label: "fr PRO (free)", lang: "fr", p: {} },
  { label: "fr CHAMPION (free)", lang: "fr", p: { tier: "champion", ovr: 91 } },
  { label: "fr LEGEND (free)", lang: "fr", p: { tier: "legend", ovr: 97 } },
  { label: "fr PRO + holo edition", lang: "fr", p: { edition: "holo" } },
  { label: "fr PRO + electric edition", lang: "fr", p: { edition: "electric" } },
  { label: "fr PRO + pixel edition", lang: "fr", p: { edition: "pixel" } },
  { label: "fr PRO + chrome edition", lang: "fr", p: { edition: "chrome" } },
  { label: "ar PRO (free)", lang: "ar", p: { name: "فاطمة الزهراء" } },
  { label: "ar PRO + holo edition", lang: "ar", p: { name: "فاطمة الزهراء", edition: "holo" } },
  {
    label: "ar PRO + electric edition",
    lang: "ar",
    p: { name: "فاطمة الزهراء", edition: "electric" },
  },
  { label: "ar PRO + pixel edition", lang: "ar", p: { name: "فاطمة الزهراء", edition: "pixel" } },
];
(async () => {
  await ready();
  const root = document.getElementById("root")!;
  for (const c of cases) {
    const profile = { ...rated, ...c.p };
    const strings = STRINGS[c.lang as "fr" | "ar"];
    const row = document.createElement("div");
    row.className = "row";
    row.dir = "ltr";
    const live = document.createElement("div");
    live.className = "live";
    live.innerHTML = fullCard(profile, { strings, theme: "dark" });
    const share = document.createElement("img");
    share.className = "share";
    share.dataset.label = c.label;
    const art = cardImage(profile, strings);
    const blob = await renderCardShareImage({
      lang: c.lang,
      art,
      caption: "Ma carte BotolaGO",
      name: profile.name,
      rating: {
        number: String(profile.ovr),
        unit: strings.ovr,
        tier: strings.tiers[profile.tier!],
      },
      season: profile.season,
      club: { initials: profile.club!.initials, primary: profile.club!.primary },
      footer: "botolago.com",
    });
    share.src = URL.createObjectURL(blob);
    const cap = document.createElement("div");
    cap.className = "cap";
    cap.textContent = c.label;
    row.append(cap, live, share);
    root.append(row);
    await new Promise((r) => (share.onload = r));
  }
  document.body.dataset.done = "1";
})();
