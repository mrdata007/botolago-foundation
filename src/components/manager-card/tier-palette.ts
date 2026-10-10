/**
 * The tier's material colours (lacquer, field, light, label, word, metal), read by the screens
 * that draw a face of the card in DOM (`curva/CardBack`). The table is the card renderer's own
 * foil ladder; this file is the way to it, so a screen never imports a card direction.
 */
export { FOIL, tierKeyOf } from "./eclat/foil";
export type { Foil, TierKey } from "./eclat/foil";
