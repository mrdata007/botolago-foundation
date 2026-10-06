import appStoreAr from "@/assets/stores/app-store-ar.svg";
import appStoreFr from "@/assets/stores/app-store-fr.svg";
import googlePlayAr from "@/assets/stores/google-play-ar.png";
import googlePlayFr from "@/assets/stores/google-play-fr.png";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { STORE_LINKS, type AppStore } from "@/lib/app-download";
import { cn } from "@/lib/utils";

/**
 * One button to the App Store and one to Google Play: the stores' own
 * badges, as Apple and Google supply them (`src/assets/stores/`), in the
 * reader's language.
 *
 * A store whose address is not set yet (`src/lib/app-download.ts`) shows its
 * badge dimmed, not as a link, with "Bientôt disponible" under it: never a
 * button that leads nowhere.
 */
const BADGES: Record<
  AppStore,
  {
    readonly file: { readonly fr: string; readonly ar: string };
    readonly ratio: { readonly fr: number; readonly ar: number };
  }
> = {
  // Width over height of each file, so both badges share one height.
  ios: { file: { fr: appStoreFr, ar: appStoreAr }, ratio: { fr: 126.5 / 40, ar: 119.66 / 40 } },
  android: {
    file: { fr: googlePlayFr, ar: googlePlayAr },
    ratio: { fr: 646 / 192, ar: 564 / 168 },
  },
};

// Rendered heights: `lg` is the back cover's, from 640px (two 56px badges
// do not fit side by side on a phone).
const HEIGHT = { md: 48, lg: 56 } as const;
const HEIGHT_CLASS = { md: "h-12", lg: "h-12 sm:h-14" } as const;

export function StoreBadges({
  size = "md",
  className,
}: {
  size?: keyof typeof HEIGHT;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <ul aria-label={t("download.stores_label")} className={cn("flex flex-wrap gap-3", className)}>
      <Badge store="ios" name={t("download.badge_app_store")} size={size} />
      <Badge store="android" name={t("download.badge_google_play")} size={size} />
    </ul>
  );
}

function Badge({
  store,
  name,
  size,
}: {
  store: AppStore;
  name: string;
  size: keyof typeof HEIGHT;
}) {
  const { t, lang } = useI18n();
  const href = STORE_LINKS[store];
  const height = HEIGHT[size];
  const width = Math.round(height * BADGES[store].ratio[lang]);
  const image = (
    <img
      src={BADGES[store].file[lang]}
      alt=""
      width={width}
      height={height}
      decoding="async"
      draggable={false}
      className={cn("block w-auto select-none", HEIGHT_CLASS[size])}
    />
  );

  if (!href) {
    return (
      <li className="flex flex-col items-center gap-1.5">
        <span
          role="img"
          aria-label={t("download.badge_soon").replace("{store}", name)}
          className="opacity-45 grayscale-[35%]"
        >
          {image}
        </span>
        <span className={cn(ui.text.micro, "[font-weight:var(--ui-weight-heavy)]", "opacity-80")}>
          {t("download.soon")}
        </span>
      </li>
    );
  }

  return (
    <li>
      <a
        href={href}
        aria-label={name}
        className={cn("press block", ui.radius.track, ui.space.tap, ui.focusOnMesh)}
      >
        {image}
      </a>
    </li>
  );
}
