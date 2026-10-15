/**
 * Paying the Saison by hand: the buyer sends the receipt on WhatsApp, with the personal code, and
 * staff activate the Saison once the payment is checked. Pure helpers, so a test can walk them.
 */

/** A WhatsApp number as `wa.me` wants it: digits only, no plus, no spaces. Null when it is not one. */
export function whatsappDigits(number: string | null | undefined): string | null {
  const digits = (number ?? "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 16 ? digits : null;
}

/** The `wa.me` link with the message already written, or null without a usable number. */
export function whatsappLink(number: string | null | undefined, message: string): string | null {
  const digits = whatsappDigits(number);
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : null;
}
