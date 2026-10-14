import { cn } from "@/lib/utils";

import { PlusLogo } from "./PlusLogo";
import { usePlusAccess } from "./plus-access";
import { PLUS_NAME, usePlusCopy } from "./plus-copy";

import "./plus-embed.css";

/**
 * The logo, small, for a member: in the app's header and in Profil. Nothing for anyone else and
 * nothing at all while the feature is off. The product name is the logo, never typed; the spoken
 * label (`plus.in.member_aria`) carries it as plain text.
 */
export function PlusMemberMark({ className }: { className?: string }) {
  const access = usePlusAccess();
  const { text } = usePlusCopy();
  if (access !== "member") return null;
  return (
    <span
      className={cn("pl-mark", className)}
      role="img"
      aria-label={text("plus.in.member_aria", { name: PLUS_NAME })}
      data-testid="plus-member-mark"
    >
      <PlusLogo label={PLUS_NAME} decorative />
    </span>
  );
}

/**
 * The header's wordmark for a member: the BotolaGO+ logo at the wordmark's size, in the bar's own
 * text colour (the wordmark is the same one; the "+" is the only addition).
 */
export function PlusHeaderLogo({ className }: { className?: string }) {
  const { text } = usePlusCopy();
  return (
    <div className={cn("items-center", className)} data-testid="plus-header-logo">
      <PlusLogo
        label={text("plus.in.member_aria", { name: PLUS_NAME })}
        height={22}
        className="pl-header-logo"
      />
    </div>
  );
}
