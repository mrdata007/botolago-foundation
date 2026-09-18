import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FplHeader, FplPill } from "@/components/fpl/primitives";
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
 * and an accordion whose expanded row carries the gradient header.
 */
function HelpPage() {
  const { t } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <FantasyFrame background="white">
      <FplHeader title={t("fpl.help_title")} backTo="/fantasy" />
      <p className="px-4 pt-4 text-[17px] text-foreground">{t("fpl.how_can_we_help")}</p>
      {SECTIONS.map((section) => (
        <section key={section.title} className="mt-4">
          <div className="px-4">
            <FplPill className="rounded-t-[6px] rounded-b-none px-4 py-2">
              {t(section.title)}
            </FplPill>
            <div className="h-px bg-[color:var(--fpl-grey)]" />
          </div>
          <ul className="mt-2 space-y-2 px-4">
            {section.items.map((item) => {
              const expanded = open === item.q;
              return (
                <li
                  key={item.q}
                  className="overflow-hidden rounded-[4px] shadow-[0_1px_4px_rgba(0,0,0,0.10)]"
                >
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : item.q)}
                    className={cn(
                      "grid w-full grid-cols-[52px_1fr] items-stretch text-start",
                      expanded
                        ? "text-[color:var(--fpl-ink-deep)]"
                        : "bg-[color:var(--fpl-bg)] text-foreground",
                    )}
                    style={expanded ? { backgroundImage: "var(--fpl-grad)" } : undefined}
                  >
                    <span
                      className={cn(
                        "grid place-items-center",
                        expanded
                          ? "bg-[color:var(--fpl-ink)] text-white"
                          : "bg-[color:var(--fpl-grey)] text-foreground",
                      )}
                    >
                      {expanded ? (
                        <ChevronUp className="h-5 w-5" aria-hidden />
                      ) : (
                        <ChevronDown className="h-5 w-5" aria-hidden />
                      )}
                    </span>
                    <span className="px-3 py-3 text-[16px] font-extrabold leading-snug">
                      {t(item.q)}
                    </span>
                  </button>
                  {expanded ? (
                    <div className="whitespace-pre-line bg-white px-4 py-3 text-[15px] leading-relaxed text-foreground">
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
