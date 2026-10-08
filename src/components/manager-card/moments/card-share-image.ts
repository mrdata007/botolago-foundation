import type { MyCardDto } from "@/backend/manager-card/contracts";
import type { CardLang, CardProfile } from "../types";

/**
 * The share picture (plan sections 4.7 and 6.7), 1080 × 1920 on a canvas: STUB from WP1 (the
 * foundation), replaced by WP4. The signature below is WP1's first reading; WP4 owns it. It
 * resolves to null (no picture) until then.
 */
export interface CardShareImageInput {
  card: MyCardDto;
  profile: CardProfile;
  lang: CardLang;
}

export async function drawCardShareImage(input: CardShareImageInput): Promise<Blob | null> {
  void input;
  return null;
}
