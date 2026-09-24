import helpArt from "@/assets/illustrations/help-hero.webp";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { ui, UiHeader, UiPill } from "@/components/ui-kit";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/fantasy/help")({
  component: HelpPage,
});

const SECTIONS: Array<{
  title: TranslationKey;
  items: Array<{ q: TranslationKey; a: TranslationKey }>;
}> = [
  {
    title: "fpl.help.section.account",
    items: [
      { q: "fpl.help.q.signin", a: "fpl.help.a.signin" },
      { q: "fpl.help.q.history", a: "fpl.help.a.history" },
    ],
  },
  {
    title: "fpl.help.section.squad",
    items: [
      { q: "fpl.help.q.multiple_teams", a: "fpl.help.a.multiple_teams" },
      { q: "fpl.help.q.changes_after", a: "fpl.help.a.changes_after" },
      { q: "fpl.help.q.budget", a: "fpl.help.a.budget" },
    ],
  },
  {
    title: "fpl.help.section.manage",
    items: [
      { q: "fpl.help.q.formation", a: "fpl.help.a.formation" },
      { q: "fpl.help.q.captain", a: "fpl.help.a.captain" },
      { q: "fpl.help.q.team_name", a: "fpl.help.a.team_name" },
      { q: "fpl.help.q.during_gw", a: "fpl.help.a.during_gw" },
      { q: "fpl.help.q.chips", a: "fpl.help.a.chips" },
    ],
  },
];

/**
 * FPL-024/025 "Help and Rules": "How can we help?" intro, ink section pills
 * and an accordion whose expanded row carries the action gradient.
 *
 * Converted to the kit (BG-0092). The accordion rows used to sit on literal
 * `bg-white` with a hand-rolled `rgba()` shadow, and the collapsed chevron
 * cell took `text-white` on an ink fill — both un-themed, so the expanded
 * and collapsed states read at ~1.1:1 against a dark card.
 *
 * The header and the section pills now come straight from the kit rather than
 * through `components/fpl/primitives`. `FplHeader title backTo` was
 * `UiHeader` with `tone="gradient"` and its history fallback suppressed by
 * the explicit `backTo`, and `FplPill` on its default tone was `UiPill` —
 * same elements, same classes, one indirection fewer. That adapter is a
 * migration seam, not a layer this screen needs.
 */
function HelpPage() {
  const { t } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <FantasyFrame background="white">
      <UiHeader title={t("fpl.help_title")} tone="gradient" backTo="/fantasy" />
      <img
        src={helpArt}
        alt=""
        aria-hidden
        decoding="async"
        className="mx-auto mt-4 h-auto max-h-36 w-auto max-w-full object-contain"
      />
      <p className={cn("pt-4", ui.space.gutter, ui.text.section, ui.tone.default)}>
        {t("fpl.how_can_we_help")}
      </p>
      {SECTIONS.map((section) => (
        <section key={section.title} className="mt-4">
          <div className={ui.space.gutter}>
            {/* A folder tab sitting on the rule: small top corners, a square
                base. The shape is stated here because `UiPill` is fully
                round now, and `rounded-b-none` on a `rounded-full` pill
                leaves a dome (the top radii scale up to the full height). */}
            <UiPill className={cn(ui.radius.control, "rounded-b-none px-4 py-2")}>
              {t(section.title)}
            </UiPill>
            <div className={ui.rule.block} />
          </div>
          <ul className={cn("mt-2 space-y-2", ui.space.gutter)}>
            {section.items.map((item) => {
              const expanded = open === item.q;
              return (
                <li
                  key={item.q}
                  className={cn(
                    "overflow-hidden",
                    ui.radius.control,
                    "shadow-[var(--ui-shadow-card)]",
                  )}
                >
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : item.q)}
                    className={cn(
                      "grid w-full grid-cols-[52px_1fr] items-stretch text-start",
                      ui.focus,
                      expanded
                        ? "text-[color:var(--ui-ink-deep)]"
                        : cn(ui.surface.sunken, ui.tone.default),
                    )}
                    style={expanded ? { backgroundImage: "var(--ui-grad-action)" } : undefined}
                  >
                    <span
                      className={cn(
                        "grid place-items-center",
                        expanded ? ui.surface.inkPlain : cn(ui.surface.sunken, ui.tone.default),
                      )}
                    >
                      {expanded ? (
                        <ChevronUp className="h-5 w-5" aria-hidden />
                      ) : (
                        <ChevronDown className="h-5 w-5" aria-hidden />
                      )}
                    </span>
                    {/* A collapsed question is a list-row label, not a
                        heading. This was `ui.text.subtitle` — 16px at weight
                        800 — and because the page renders as nothing but
                        collapsed questions, every one of its 671 visible
                        characters was extra-bold. Measured rather than
                        guessed: a weight tally across seven routes put
                        /fantasy/help at 100% weight 800, the only route in
                        the product with no normal-weight text at all. Body
                        size at `strong` keeps it plainly the tappable label
                        without the whole page shouting.

                        `leading-snug` went with it. The ramp now carries
                        leading per step and per script (BG-0124), and a
                        Tailwind literal beside it is a second source of truth
                        that wins or loses on class order. */}
                    <span
                      className={cn(
                        "px-3 py-3",
                        ui.text.body,
                        "[font-weight:var(--ui-weight-strong)]",
                        "min-h-[var(--ui-tap-min)]",
                      )}
                    >
                      {t(item.q)}
                    </span>
                  </button>
                  {expanded ? (
                    /* `prose` rather than `body` + `leading-relaxed`: an answer
                       is the longest continuous copy on any Fantasy screen, and
                       it is the step built for that — with an Arabic line box
                       that does not have to be remembered at the call site. */
                    <div
                      className={cn("whitespace-pre-line px-4 py-3", ui.surface.bar, ui.text.prose)}
                    >
                      {t(item.a)}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <div className="h-8" />
    </FantasyFrame>
  );
}
