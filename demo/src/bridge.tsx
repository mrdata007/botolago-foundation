/**
 * The line between the app and the presenter page around it.
 *
 * The presenter (demo/presenter/presenter.html) shows this app in an iframe.
 * It sends commands (go to a step, fill the team, play the gameweek, change
 * the sponsor or the language) and the app answers with where it is, so the
 * step list follows taps made inside the phone. Nothing here leaves the page.
 */
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { useI18n } from "@/i18n/provider";

import { scoreTeam, summarize, useDemo, type Sponsor } from "./state";
import { useDemoUi, type DemoLayout } from "./ui-state";

const PREFIX = "botolago-demo:";

type Command =
  | { type: "botolago-demo:hello"; layout: DemoLayout }
  | { type: "botolago-demo:navigate"; path: string }
  | { type: "botolago-demo:autofill" }
  | { type: "botolago-demo:play" }
  | { type: "botolago-demo:reset" }
  | { type: "botolago-demo:sponsor"; sponsor: Sponsor }
  | { type: "botolago-demo:highlight"; on: boolean }
  | { type: "botolago-demo:lang"; lang: "fr" | "ar" };

const HEX = /^#[0-9a-f]{6}$/i;

function cleanSponsor(value: unknown): Sponsor | null {
  if (!value || typeof value !== "object") return null;
  const sponsor = value as Partial<Sponsor>;
  const name = typeof sponsor.name === "string" ? sponsor.name.slice(0, 40) : "";
  const color =
    typeof sponsor.color === "string" && HEX.test(sponsor.color) ? sponsor.color : "#1d2740";
  const logo =
    typeof sponsor.logo === "string" && sponsor.logo.startsWith("data:image/")
      ? sponsor.logo
      : null;
  return { name, color, logo };
}

export function PresenterBridge() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { state, actions } = useDemo();
  const { lang, setLanguage } = useI18n();
  const { setLayout, setHighlightSponsor } = useDemoUi();

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || window.parent === window) return;
      const data = event.data as Command | undefined;
      if (!data || typeof data.type !== "string" || !data.type.startsWith(PREFIX)) return;
      switch (data.type) {
        case "botolago-demo:hello":
          if (data.layout === "stage" || data.layout === "solo") setLayout(data.layout);
          break;
        case "botolago-demo:navigate":
          if (typeof data.path === "string" && data.path.startsWith("/"))
            void navigate({ to: data.path });
          break;
        case "botolago-demo:autofill":
          actions.autofill();
          break;
        case "botolago-demo:play":
          actions.play();
          break;
        case "botolago-demo:reset":
          actions.reset();
          void navigate({ to: "/" });
          break;
        case "botolago-demo:sponsor": {
          const sponsor = cleanSponsor(data.sponsor);
          if (sponsor) actions.setSponsor(sponsor);
          break;
        }
        case "botolago-demo:highlight":
          setHighlightSponsor(!!data.on);
          break;
        case "botolago-demo:lang":
          if (data.lang === "fr" || data.lang === "ar") setLanguage(data.lang);
          break;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [navigate, actions, setLanguage, setLayout, setHighlightSponsor]);

  useEffect(() => {
    if (window.parent === window) return;
    const summary = summarize(state);
    window.parent.postMessage(
      {
        type: `${PREFIX}status`,
        path,
        lang,
        filled: summary.filled,
        hasCaptain: !!state.captainId && !!state.viceId,
        saved: state.saved,
        played: state.played,
        points: state.played ? scoreTeam(state).total : null,
        sponsor: state.sponsor,
      },
      "*",
    );
  }, [path, lang, state]);

  return null;
}
