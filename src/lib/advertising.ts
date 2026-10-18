export type AdPlacement = "homeFeed" | "newsFeed" | "articleEnd";
export type SponsorCreative = { image: string; href: string; alt: string };
export type AdSettings = {
  enabled: boolean;
  publisherId: string;
  sellerId: string;
  units: Record<AdPlacement, string>;
  sponsors: Partial<Record<AdPlacement, SponsorCreative>>;
};

// Public IDs only. Keep off until site approval and consent setup; see docs/engineering/ADVERTISING.md.
export const ADVERTISING: AdSettings = {
  enabled: false,
  publisherId: "",
  sellerId: "",
  units: { homeFeed: "", newsFeed: "", articleEnd: "" },
  sponsors: {},
};

export function validPublisherId(value: string): boolean {
  return /^ca-pub-\d{16}$/.test(value);
}

export function adSenseReady(config: AdSettings, placement: AdPlacement): boolean {
  return (
    config.enabled && validPublisherId(config.publisherId) && /^\d+$/.test(config.units[placement])
  );
}

export function validSponsor(value: SponsorCreative | undefined): value is SponsorCreative {
  if (!value?.alt.trim()) return false;
  const url = (s: string) => /^https:\/\//i.test(s) || /^\/(?!\/)/.test(s);
  return url(value.href) && url(value.image);
}

export function adsVisitorAllowed(input: {
  ready: boolean;
  member: boolean;
  native: boolean;
  authReady: boolean;
  membershipKnown: boolean;
}): boolean {
  return input.ready && input.authReady && input.membershipKnown && !input.member && !input.native;
}

export function advertisingTxt(config: AdSettings): string | null {
  return validPublisherId(config.publisherId) &&
    /^pub-\d{16}$/.test(config.sellerId) &&
    config.publisherId === `ca-${config.sellerId}`
    ? `google.com, ${config.sellerId}, DIRECT, f08c47fec0942fa0\n`
    : null;
}
