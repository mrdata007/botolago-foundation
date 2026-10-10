import { describe, expect, it, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import { MatchCard } from "@/components/common/MatchCard";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { NOTIFICATION_EMAIL_LIVE } from "@/lib/feature-flags";
import {
  NotificationEmailLiveContext,
  useNotificationEmailLive,
} from "@/lib/notification-email-live";
import type { Club, Match } from "@/types/domain";

/**
 * Owner decision, 2026-10-07 (critique P1): nothing on screen promises a
 * reminder or an e-mail while notification e-mail is not sent, and everything
 * comes back unchanged when it is. One build-time switch,
 * `NOTIFICATION_EMAIL_LIVE`, read through `useNotificationEmailLive()`.
 *
 * Like the other flags' tests, nothing here asserts which way the switch is
 * set: flipping it is the supported way to go live. The render tests pass the
 * state explicitly through the context, so both states are checked whatever
 * the constant says; the source tests pin that each gated place reads the
 * switch and still holds today's code path for the "on" state.
 */

const ROOT = join(import.meta.dir, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
const stripComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/** Every shipped `.ts`/`.tsx` under `src/`, tests excluded. */
const sourceFiles = (): string[] =>
  readdirSync(join(ROOT, "src"), { recursive: true, encoding: "utf8" })
    .filter((entry) => /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry))
    .map((entry) => join("src", entry))
    .sort();

const GATED = [
  "src/components/common/MatchCard.tsx",
  "src/components/pepites/PepitesHome.tsx",
  "src/components/pepites/PepitesFollowButton.tsx",
  "src/routes/notifications.tsx",
  "src/routes/auth.profile-setup.tsx",
  "src/routes/profile.tsx",
  "src/components/fantasy/FantasyHubPersonal.tsx",
  "src/components/pepites/admin/PepitesAdminEditions.tsx",
];

describe("NOTIFICATION_EMAIL_LIVE", () => {
  test("is a single boolean constant, recorded with the owner decision", () => {
    expect(typeof NOTIFICATION_EMAIL_LIVE).toBe("boolean");
    const source = read("src/lib/feature-flags.ts");
    expect(source.match(/export const NOTIFICATION_EMAIL_LIVE\b/g)).toHaveLength(1);
    expect(source).toContain("Owner decision, 2026-10-07");
    // The owner's step is written down on both sides.
    expect(source).toContain("docs/backend/EMAIL_NOTIFICATIONS.md");
    expect(read("docs/backend/EMAIL_NOTIFICATIONS.md")).toContain("NOTIFICATION_EMAIL_LIVE");
  });

  test("its comment lists every gated place, and each of them reads the switch", () => {
    const source = read("src/lib/feature-flags.ts");
    const at = source.indexOf("export const NOTIFICATION_EMAIL_LIVE");
    const comment = source.slice(source.lastIndexOf("/**", at), at);
    for (const file of GATED) {
      expect(`${file}: ${comment.includes(`\`${file}\``)}`).toBe(`${file}: true`);
      expect(`${file}: ${/\buseNotificationEmailLive\(\)/.test(stripComments(read(file)))}`).toBe(
        `${file}: true`,
      );
    }
  });

  test("screens read it through the hook; only the hook's module reads the constant", () => {
    const strays = sourceFiles().filter(
      (file) =>
        file !== "src/lib/feature-flags.ts" &&
        file !== "src/lib/notification-email-live.ts" &&
        /\bNOTIFICATION_EMAIL_LIVE\b/.test(stripComments(read(file))),
    );
    expect(strays).toEqual([]);
  });

  test("the app never overrides it: no shipped file renders the context's provider", () => {
    const providers = sourceFiles().filter((file) =>
      /NotificationEmailLiveContext\.Provider|<NotificationEmailLiveContext\b/.test(
        stripComments(read(file)),
      ),
    );
    expect(providers).toEqual([]);
  });

  test("without a provider the hook answers the constant", () => {
    function Probe() {
      return <i>{String(useNotificationEmailLive())}</i>;
    }
    expect(renderToString(<Probe />)).toBe(`<i>${String(NOTIFICATION_EMAIL_LIVE)}</i>`);
  });
});

/* -------------------------------------------------------------------------- */
/* The reminder bell, rendered in both states                                 */
/* -------------------------------------------------------------------------- */

const fr = dictionaries.fr;

function club(name: string, code: string): Club {
  return {
    id: `club-${code}`,
    name: { fr: name, ar: name },
    shortName: { fr: code, ar: code },
    city: { fr: "", ar: "" },
    primaryColor: "var(--ui-ink)",
    crestPlaceholder: code,
  };
}

const FAR = club("AS FAR", "FAR");
const RAJA = club("Raja CA", "RCA");

const SCHEDULED: Match = {
  id: "m1",
  gameweek: 3,
  homeClubId: FAR.id,
  awayClubId: RAJA.id,
  kickoff: "2026-10-08T16:00:00Z",
  status: "scheduled",
  venue: { fr: "", ar: "" },
};

async function render(node: ReactElement, live: boolean): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <NotificationEmailLiveContext.Provider value={live}>
          {node}
        </NotificationEmailLiveContext.Provider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return renderToString(
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>,
  ).replace(/<!-- -->/g, "");
}

const bell = `aria-label="${fr["reminders.bell.off"]}"`;

describe("match rows: the reminder bell follows the switch", () => {
  it("live: the bell on a scheduled row, with the end padding kept for it (today's row)", async () => {
    for (const variant of ["list", "row"] as const) {
      const html = await render(
        <MatchCard match={SCHEDULED} home={FAR} away={RAJA} variant={variant} />,
        true,
      );
      expect(html).toContain(bell);
      expect(html).toContain("pe-14");
    }
  });

  it("not live: no bell anywhere, and the row takes the space back", async () => {
    for (const variant of ["list", "row", "compact", "hero"] as const) {
      const html = await render(
        <MatchCard match={SCHEDULED} home={FAR} away={RAJA} variant={variant} />,
        false,
      );
      expect(html).not.toContain(bell);
      expect(html).not.toContain(`aria-label="${fr["reminders.bell.on"]}"`);
      expect(html).not.toContain("pe-14");
    }
  });

  it("live or not, a finished match and an unconfirmed kick-off never carry one", async () => {
    const finished = { ...SCHEDULED, status: "finished" as const, homeScore: 1, awayScore: 0 };
    for (const live of [true, false]) {
      const html = await render(<MatchCard match={finished} home={FAR} away={RAJA} />, live);
      expect(html).not.toContain(bell);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* With the switch on, every other place keeps today's code path              */
/* -------------------------------------------------------------------------- */

describe("each gated place keeps today's branch for the 'on' state", () => {
  test.each([
    // The weekly e-mail card, toast included, unchanged inside the gate.
    ["src/components/pepites/PepitesHome.tsx", "{emailLive ? <WeeklyEmailCard /> : null}"],
    [
      "src/components/pepites/PepitesFollowButton.tsx",
      'if (emailLive) body = t("pepites.follow.sheet_body");',
    ],
    ["src/routes/notifications.tsx", 'if (emailLive) body = t("notifications.signin_body");'],
    ["src/routes/notifications.tsx", 'if (emailLive) emptyBody = t("notifications.empty_body");'],
    ["src/routes/profile.tsx", "{notificationsOn}/3"],
    ["src/components/fantasy/FantasyHubPersonal.tsx", "if (!emailLive) return null;"],
    [
      "src/components/pepites/admin/PepitesAdminEditions.tsx",
      "Tous les lecteurs le verront tout de suite, et l'e-mail part aux abonnés.",
    ],
  ])("%s", (file, needle) => {
    expect(stripComments(read(file))).toContain(needle);
  });

  test("sign-up step 3: the four boxes are still there, behind the switch", () => {
    const source = stripComments(read("src/routes/auth.profile-setup.tsx"));
    const gate = source.indexOf("{emailLive &&");
    expect(gate).toBeGreaterThan(-1);
    for (const key of [
      '"auth.setup.notif_match"',
      '"auth.setup.notif_news"',
      '"auth.setup.notif_deadline"',
      't("auth.setup.notif_email")',
    ]) {
      expect(`${key}: ${source.indexOf(key) > gate}`).toBe(`${key}: true`);
    }
    // While off the step says why instead, in the shared sentence.
    expect(source).toContain('t("notifications.not_sent_yet")');
    // And "Terminer" still saves the categories as loaded: the save is not gated.
    expect(source).toContain("notifications: prefs,");
  });

  test("the bell component itself is untouched by the switch", () => {
    // It is gated where it is placed (MatchCard), so with the switch on it
    // behaves exactly as before: the same toasts, the same e-mail offer.
    const bellSource = stripComments(read("src/components/common/MatchReminderBell.tsx"));
    expect(bellSource).not.toContain("useNotificationEmailLive");
    expect(bellSource).toContain('t("reminders.toast.needs_email")');
  });
});

describe("the 'not sent yet' copy promises nothing", () => {
  test.each(["fr", "ar"] as const)("%s", (lang) => {
    const dictionary = dictionaries[lang];
    expect(dictionary["notifications.not_sent_yet"].length).toBeGreaterThan(0);
    expect(dictionary["profile.notifications_not_active"].length).toBeGreaterThan(0);
    const sheet = dictionary["pepites.follow.sheet_body_no_email"];
    expect(sheet.length).toBeGreaterThan(0);
    // The follow sheet keeps following and Fantasy, and drops the e-mail.
    expect(sheet).not.toMatch(/Top 10|lundi|10|الاثنين/);
  });
});
