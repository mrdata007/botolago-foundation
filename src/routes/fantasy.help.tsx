import helpArt from "@/assets/illustrations/help-hero.webp";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";

import { SectionHeader } from "@/components/common/SectionHeader";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { ui, UiHeader } from "@/components/ui-kit";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import { fantasyHead } from "@/lib/fantasy-meta";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/fantasy/help")({
  head: () => fantasyHead("help"),
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
 * FPL-024/025 "Help and Rules": the "How can we help?" intro, a display
 * heading per section, and an accordion of questions.
 *
 * Option A: each question is a white card at the card radius with a round
 * soft chevron disc on its inline end; opening it turns the chevron and lays
 * the answer out under the question in the same card. The section folder tabs
 * (ink pills with square bases) are display section headings now, and the
 * expanded row no longer floods with the action gradient — the open state is
 * the answer itself, the rotated chevron and the native disclosure state.
 */
function HelpPage() {
  const { t } = useI18n();
  return (
    <FantasyFrame bottomNav>
      <UiHeader kicker={t("nav.fantasy")} title={t("fpl.help_title")} backTo="/fantasy" />
      <div className={cn("pb-8", ui.space.gutter, ui.surface.page)}>
        <img
          src={helpArt}
          alt=""
          aria-hidden
          decoding="async"
          className="mx-auto mt-4 h-auto max-h-36 w-auto max-w-full object-contain"
        />
        <p className={cn("pt-4", ui.display.section, ui.tone.default)}>
          {t("fpl.how_can_we_help")}
        </p>
        {SECTIONS.map((section) => (
          <section key={section.title} className="mt-6">
            <SectionHeader title={t(section.title)} as="h2" />
            <ul className="space-y-2">
              {section.items.map((item) => (
                <HelpItem key={item.q} question={t(item.q)} answer={t(item.a)} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </FantasyFrame>
  );
}

/** Native disclosure keeps every answer in HTML and works without JavaScript. */
function HelpItem({ question, answer }: { question: string; answer: string }) {
  return (
    <li className={cn("overflow-hidden", ui.surface.card)}>
      <details name="fantasy-help" className="group">
        <summary
          className={cn(
            "flex w-full cursor-pointer list-none items-center gap-3 py-2 pe-2 ps-4 text-start [&::-webkit-details-marker]:hidden",
            ui.space.row,
            ui.focus,
            "focus-visible:ring-inset focus-visible:ring-offset-0",
          )}
        >
          <span
            className={cn(
              "min-w-0 flex-1",
              ui.text.body,
              "[font-weight:var(--ui-weight-strong)]",
              ui.tone.default,
            )}
          >
            {question}
          </span>
          <span
            aria-hidden
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center",
              ui.radius.full,
              ui.surface.sunken,
              ui.tone.ink,
              "group-open:bg-[color:var(--ui-selected)] group-open:text-[color:var(--ui-on-selected)]",
            )}
          >
            <ChevronDown className="h-5 w-5 transition-transform duration-[var(--duration-quick)] group-open:rotate-180" />
          </span>
        </summary>
        <div className={cn("whitespace-pre-line px-4 pb-4 pt-1", ui.text.prose, ui.tone.default)}>
          {answer}
        </div>
      </details>
    </li>
  );
}
