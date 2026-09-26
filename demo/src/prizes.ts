/**
 * The prize page reads its catalog through `prizesService`. In the demo that
 * service answers with the product's own sample catalog (the default prizes
 * of the prize migration), each lot carrying the partner being pitched, so
 * the page's real "Offert par …" line and logo slot show it.
 */
import { MOCK_PRIZES } from "@/backend/prizes/mock-repository";
import { prizesService } from "@/services/prizes";

let sponsor = { name: "", logo: "" };

export function setPrizeSponsor(name: string, logo: string) {
  sponsor = { name, logo };
}

prizesService.listPrizes = async () =>
  MOCK_PRIZES.map((prize) => ({
    ...prize,
    sponsorName: sponsor.name || null,
    sponsorLogoUrl: sponsor.logo || null,
  }));
