import { describe, expect, it } from "bun:test";
import {
  escapeHtml,
  renderNotificationEmail,
  resolveTimeZone,
  unsubscribeUrl,
} from "./notification-email-render";
import {
  EMAIL_NOTIFICATION_TYPES,
  type ClaimedEmailDelivery,
  type EmailFixture,
  type EmailLanguage,
  type EmailNotificationType,
  type EmailPayloadByType,
  type EmailTeam,
} from "./notification-email-types";

const APP = "https://botolago.com";
const LINKS = { appUrl: APP } as const;
const LANGUAGES: readonly EmailLanguage[] = ["fr", "ar"];

function team(id: string, fr: string, ar: string): EmailTeam {
  return { id, name: { fr, ar }, shortName: { fr, ar } };
}

const RAJA = team("raja", "Raja Casablanca", "الرجاء الرياضي");
const WYDAD = team("wydad", "Wydad Casablanca", "الوداد الرياضي");
const FAR = team("far", "AS FAR", "الجيش الملكي");
const BERKANE = team("berkane", "RS Berkane", "نهضة بركان");
const FUS = team("fus", "FUS Rabat", "الفتح الرياضي");
const MAS = team("mas", "Maghreb Fès", "المغرب الفاسي");
const HUSA = team("husa", "Hassania Agadir", "حسنية أكادير");
const IRT = team("irt", "Ittihad Tanger", "اتحاد طنجة");

let seq = 0;
function fixture(
  home: EmailTeam,
  away: EmailTeam,
  kickoffAt: string,
  extra: Partial<EmailFixture> = {},
): EmailFixture {
  seq += 1;
  return {
    id: `fx-${seq}`,
    kickoffAt,
    timeConfirmed: true,
    status: "not_started",
    home,
    away,
    homeScore: null,
    awayScore: null,
    ...extra,
  };
}

// Saturday 26 September 2026. Morocco is UTC+1 outside Ramadan.
const derby = () => fixture(RAJA, WYDAD, "2026-09-26T20:00:00Z");
const early = () => fixture(FAR, BERKANE, "2026-09-26T15:00:00Z");
const middle = () => fixture(FUS, MAS, "2026-09-26T17:00:00Z");
const unconfirmed = () =>
  fixture(HUSA, IRT, "2026-09-26T00:00:00Z", { timeConfirmed: false, status: "scheduled" });

function defaultPayload<K extends EmailNotificationType>(type: K): EmailPayloadByType[K] {
  const payloads: { [T in EmailNotificationType]: EmailPayloadByType[T] } = {
    matchday_preview: { date: "2026-09-26", fixtures: [early(), middle(), derby(), unconfirmed()] },
    matchday_results: {
      date: "2026-09-26",
      fixtures: [
        { ...early(), status: "finished", homeScore: 0, awayScore: 0 },
        { ...derby(), status: "finished", homeScore: 2, awayScore: 1 },
        { ...unconfirmed(), status: "postponed" },
      ],
    },
    round_preview: {
      round: { id: "round-5", number: 5, name: "Journée 5" },
      fixtures: [
        fixture(RAJA, FAR, "2026-10-03T19:00:00Z"),
        fixture(WYDAD, BERKANE, "2026-10-02T19:00:00Z"),
        fixture(FUS, HUSA, "2026-10-04T16:00:00Z"),
        fixture(MAS, IRT, "2026-10-03T00:00:00Z", { timeConfirmed: false }),
      ],
    },
    match_starting: { fixture: derby(), minutes: 60 },
    deadline_24h: {
      gameweek: { id: "gw-5", sequence: 5, name: "Journée 5" },
      deadlineAt: "2026-09-25T17:30:00Z",
    },
    gameweek_finalized: { gameweek: 5, points: 64, overallRank: 12, totalPoints: 312 },
  };
  return payloads[type];
}

function delivery<K extends EmailNotificationType>(
  type: K,
  overrides: Partial<{
    language: EmailLanguage;
    timezone: string;
    displayName: string | null;
    favoriteTeamId: string | null;
    unsubscribeToken: string;
    payload: EmailPayloadByType[K];
  }> = {},
): ClaimedEmailDelivery {
  return {
    id: "delivery-1",
    notificationId: "notification-1",
    attemptNumber: 1,
    language: overrides.language ?? "fr",
    timezone: overrides.timezone ?? "Africa/Casablanca",
    recipient: {
      email: "fan@example.com",
      displayName: "displayName" in overrides ? (overrides.displayName ?? null) : "Yassine",
    },
    favoriteTeamId: "favoriteTeamId" in overrides ? (overrides.favoriteTeamId ?? null) : null,
    unsubscribeToken: overrides.unsubscribeToken ?? "tok-123",
    type,
    payload: overrides.payload ?? defaultPayload(type),
  } as ClaimedEmailDelivery;
}

const render = (d: ClaimedEmailDelivery) => renderNotificationEmail(d, LINKS);

/** Plain-text lines that list a match ("- A – B · 21:00"). */
const matchLines = (text: string) => text.split("\n").filter((line) => line.startsWith("- "));

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;",
    );
  });

  it("escapes ampersands first, so existing entities are not left live", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});

describe("renderNotificationEmail: every type in both languages", () => {
  for (const type of EMAIL_NOTIFICATION_TYPES) {
    for (const language of LANGUAGES) {
      it(`${type} (${language}) renders a complete email`, () => {
        const email = render(delivery(type, { language }));
        expect(email.subject.length).toBeGreaterThan(0);
        expect(email.preheader.length).toBeGreaterThan(0);
        expect(email.text.length).toBeGreaterThan(0);
        expect(email.html.startsWith("<!DOCTYPE html>")).toBe(true);

        // Subject and preheader are plain text: no markup, no entities, no line breaks.
        for (const line of [email.subject, email.preheader]) {
          expect(line).not.toMatch(/[<>\r\n]/);
          expect(line).not.toMatch(/&(#\d+|#x[0-9a-f]+|[a-z]+);/i);
        }
        expect(email.text).not.toMatch(/&(#\d+|[a-z]+);/i);
        expect(email.text).not.toContain("<");

        // No scripts, no external resources.
        expect(email.html).not.toMatch(/<script|<link|<img|@import|javascript:/i);

        // A hidden preheader carrying the preheader text.
        expect(email.html).toMatch(/<div style="display:none;max-height:0;[^"]*overflow:hidden;/);
        expect(email.html).toContain(escapeHtml(email.preheader));

        // The footer, in both bodies.
        const why =
          language === "fr"
            ? "Vous recevez cet e-mail car les notifications par e-mail sont activées sur votre compte BotolaGO."
            : "تتلقى هذه الرسالة لأن إشعارات البريد الإلكتروني مفعّلة في حسابك على BotolaGO.";
        const manage = language === "fr" ? "Gérer mes notifications" : "إدارة الإشعارات";
        const unsubscribe = language === "fr" ? "Se désabonner" : "إلغاء الاشتراك";
        for (const body of [email.html, email.text]) {
          expect(body).toContain(why);
          expect(body).toContain(manage);
          expect(body).toContain(unsubscribe);
          expect(body).toContain("BotolaGO · botolago.com");
          expect(body).toContain(`${APP}/unsubscribe?token=tok-123`);
          expect(body).toContain(`${APP}/profile`);
        }
      });
    }
  }
});

describe("language and direction", () => {
  it("French is lang=fr, left to right", () => {
    const { html } = render(delivery("matchday_preview", { language: "fr" }));
    expect(html).toContain('<html lang="fr" dir="ltr">');
    expect(html).not.toContain('dir="rtl"');
    expect(html).toContain("text-align:left;");
  });

  it("Arabic is lang=ar, right to left, and actually aligned right", () => {
    const { html } = render(delivery("matchday_preview", { language: "ar" }));
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain('<body dir="rtl"');
    // Every layout table carries the direction, not only the root.
    const tables = html.match(/<table role="presentation" dir="(ltr|rtl)"/g) ?? [];
    expect(tables.length).toBeGreaterThan(3);
    expect(tables.every((tag) => tag.includes('dir="rtl"'))).toBe(true);
    // The body card starts on the right.
    expect(html).toMatch(/class="bg-card" dir="rtl" align="right" style="[^"]*text-align:right;/);
  });

  it("Arabic keeps times and scores in their own direction", () => {
    const preview = render(delivery("matchday_preview", { language: "ar" }));
    expect(preview.html).toContain('<span dir="ltr">21:00</span>');

    const results = render(delivery("matchday_results", { language: "ar" }));
    // Each score isolated separately, so the home score stays beside the home club.
    expect(results.html).toContain('<span dir="ltr">2</span> – <span dir="ltr">1</span>');
  });

  it("uses the app's Arabic vocabulary", () => {
    const deadline = render(delivery("deadline_24h", { language: "ar" }));
    expect(deadline.text).toContain("الجولة: 5");
    expect(deadline.text).toContain("الموعد النهائي");
    expect(deadline.subject).toContain("فانتازي");
    const points = render(delivery("gameweek_finalized", { language: "ar" }));
    expect(points.text).toContain("مجموع النقاط: 312");
    expect(points.text).toContain("الترتيب العام: 12");
  });
});

describe("greeting", () => {
  it("greets by display name when present", () => {
    expect(render(delivery("deadline_24h")).text).toContain("Bonjour Yassine,");
    expect(render(delivery("deadline_24h", { language: "ar" })).text).toContain("مرحبًا Yassine،");
  });

  it("falls back to a plain greeting", () => {
    const fr = render(delivery("deadline_24h", { displayName: null }));
    expect(fr.text).toContain("Bonjour,");
    const ar = render(delivery("deadline_24h", { language: "ar", displayName: "   " }));
    expect(ar.text).toContain("مرحبًا،");
  });
});

describe("unsubscribe link", () => {
  it("is built from the app origin and the encoded token", () => {
    const d = delivery("deadline_24h", { unsubscribeToken: "a/b+c=d&e f?g#h" });
    const expected = `${APP}/unsubscribe?token=a%2Fb%2Bc%3Dd%26e%20f%3Fg%23h`;
    expect(unsubscribeUrl(d, LINKS)).toBe(expected);
    const email = render(d);
    expect(email.text).toContain(expected);
    expect(email.html).toContain(`href="${expected}"`);
  });

  it("tolerates a trailing slash on appUrl", () => {
    const d = delivery("deadline_24h");
    expect(unsubscribeUrl(d, { appUrl: `${APP}/` })).toBe(`${APP}/unsubscribe?token=tok-123`);
  });

  it("refuses an appUrl that is not an http(s) origin", () => {
    const d = delivery("deadline_24h");
    expect(() => renderNotificationEmail(d, { appUrl: "javascript:alert(1)" })).toThrow();
    expect(() => renderNotificationEmail(d, { appUrl: "not a url" })).toThrow();
    expect(() => renderNotificationEmail(d, { appUrl: `${APP}?x=1` })).toThrow();
  });
});

describe("escaping", () => {
  it("escapes a malicious display name in the HTML", () => {
    const email = render(delivery("deadline_24h", { displayName: "<script>alert(1)</script>" }));
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("Bonjour &lt;script&gt;alert(1)&lt;/script&gt;,");
    // The plain-text body is text: the name appears as written, harmlessly.
    expect(email.text).toContain("Bonjour <script>alert(1)</script>,");
  });

  it("escapes club names with ampersands and quotes, and keeps the subject raw", () => {
    const odd = team("odd", `Club "Olympique" & Fils'`, `نادي "الأولمبي" & أبناؤه`);
    const payload = {
      date: "2026-09-26",
      fixtures: [fixture(odd, WYDAD, "2026-09-26T20:00:00Z")],
    };
    const email = render(delivery("matchday_preview", { favoriteTeamId: "odd", payload }));
    expect(email.html).toContain("Club &quot;Olympique&quot; &amp; Fils&#39;");
    expect(email.html).not.toContain(`Club "Olympique" & Fils'`);
    expect(email.subject).toBe(`Aujourd'hui : Club "Olympique" & Fils' – Wydad Casablanca à 21:00`);
    expect(email.text).toContain(`Club "Olympique" & Fils' – Wydad Casablanca · 21:00`);
  });

  it("strips line breaks and bidi overrides from data before it reaches the subject", () => {
    const sneaky = team("sneaky", "Raja\r\nBcc: victim@example.com", "Raja‮evil");
    const payload = {
      fixture: fixture(sneaky, WYDAD, "2026-09-26T20:00:00Z"),
      minutes: 60,
    };
    const fr = render(delivery("match_starting", { payload }));
    expect(fr.subject).not.toMatch(/[\r\n]/);
    expect(fr.subject).toBe(
      "Raja Bcc: victim@example.com – Wydad Casablanca commence dans 1 heure",
    );
    const ar = render(delivery("match_starting", { language: "ar", payload }));
    expect(ar.subject).not.toContain("‮");
    expect(ar.html).not.toContain("‮");
  });
});

describe("favourite club", () => {
  it("puts the favourite's match first and personalises the preview subject", () => {
    const email = render(delivery("matchday_preview", { favoriteTeamId: "raja" }));
    expect(email.subject).toBe("Aujourd'hui : Raja Casablanca – Wydad Casablanca à 21:00");
    const lines = matchLines(email.text);
    expect(lines[0]).toBe("- Raja Casablanca – Wydad Casablanca · 21:00 (Votre club)");
    // In the HTML too: the derby comes before the earlier kickoffs.
    expect(email.html.indexOf("Raja Casablanca")).toBeLessThan(email.html.indexOf("AS FAR"));
    expect(email.html).toContain(">Votre club</span>");
    // Only the favourite row is highlighted.
    expect(email.html.match(/>Votre club<\/span>/g)?.length).toBe(1);
  });

  it("personalises in Arabic", () => {
    const email = render(delivery("matchday_preview", { language: "ar", favoriteTeamId: "wydad" }));
    expect(email.subject).toBe("اليوم: الرجاء الرياضي – الوداد الرياضي على الساعة 21:00");
    expect(matchLines(email.text)[0]).toContain("(فريقك)");
    expect(email.html).toContain(">فريقك</span>");
  });

  it("keeps the generic subject, in kickoff order, without a favourite", () => {
    const email = render(delivery("matchday_preview"));
    expect(email.subject).toBe("Aujourd'hui en Botola Pro : 4 matchs");
    expect(email.html).not.toContain("Votre club");
    expect(matchLines(email.text)).toEqual([
      "- AS FAR – RS Berkane · 16:00",
      "- FUS Rabat – Maghreb Fès · 18:00",
      "- Raja Casablanca – Wydad Casablanca · 21:00",
      "- Hassania Agadir – Ittihad Tanger · heure à confirmer",
    ]);
  });

  it("leads the results with the favourite's score", () => {
    const email = render(delivery("matchday_results", { favoriteTeamId: "raja" }));
    expect(email.subject).toBe(
      "Raja Casablanca 2 – 1 Wydad Casablanca : tous les résultats du jour",
    );
    expect(matchLines(email.text)[0]).toBe("- Raja Casablanca 2 – 1 Wydad Casablanca (Votre club)");
    const ar = render(delivery("matchday_results", { language: "ar", favoriteTeamId: "raja" }));
    expect(ar.subject).toBe("الرجاء الرياضي 2 – 1 الوداد الرياضي: كل نتائج اليوم");
    expect(render(delivery("matchday_results")).subject).toBe("Résultats du jour en Botola Pro");
  });

  it("calls out the favourite's match at the top of the round preview", () => {
    const email = render(delivery("round_preview", { favoriteTeamId: "raja" }));
    expect(email.text).toContain("Votre club : Raja Casablanca – AS FAR, samedi 3 octobre à 20:00");
    expect(email.text.indexOf("Votre club :")).toBeLessThan(
      email.text.indexOf("Vendredi 2 octobre"),
    );
    expect(email.preheader).toBe("Votre club joue samedi 3 octobre à 20:00");
  });
});

describe("time not confirmed", () => {
  it("shows the date and 'heure à confirmer', never the placeholder hour", () => {
    const payload = { date: "2026-09-26", fixtures: [unconfirmed()] };
    const email = render(delivery("matchday_preview", { favoriteTeamId: "husa", payload }));
    expect(email.subject).toBe(
      "Aujourd'hui : Hassania Agadir – Ittihad Tanger (heure à confirmer)",
    );
    expect(email.html).toContain("Heure à confirmer");
    expect(email.html).toContain("Samedi 26 septembre");
    for (const body of [email.html, email.text, email.subject, email.preheader]) {
      expect(body).not.toContain("00:00");
      expect(body).not.toContain("01:00");
    }
  });

  it("uses the app's Arabic wording", () => {
    const payload = { date: "2026-09-26", fixtures: [unconfirmed()] };
    const email = render(delivery("matchday_preview", { language: "ar", payload }));
    expect(email.text).toContain("التوقيت غير مؤكد");
    expect(email.html).not.toContain("01:00");
  });

  it("files the match under its competition day even west of Greenwich", () => {
    const email = render(delivery("round_preview", { timezone: "America/New_York" }));
    // 2026-10-03T00:00Z is Friday evening in New York, but the match is on Saturday.
    expect(email.text).toContain(
      [
        "Samedi 3 octobre",
        "- Raja Casablanca – AS FAR · 15:00",
        "- Maghreb Fès – Ittihad Tanger · heure à confirmer",
      ].join("\n"),
    );
    // The placeholder is 20:00 on Friday in New York; it must not surface.
    expect(email.text).not.toContain("Maghreb Fès – Ittihad Tanger · 20:00");
  });
});

describe("postponed and cancelled matches", () => {
  it("lists a postponed match as 'reporté' without a score", () => {
    const payload = {
      date: "2026-09-26",
      fixtures: [
        { ...derby(), status: "finished", homeScore: 2, awayScore: 1 },
        // A stale 0 – 0 on a postponed match must not be shown as a result.
        { ...unconfirmed(), status: "postponed", homeScore: 0, awayScore: 0 },
      ],
    };
    const email = render(delivery("matchday_results", { payload }));
    expect(email.text).toContain("- Hassania Agadir – Ittihad Tanger · reporté");
    expect(email.text).not.toContain("Hassania Agadir 0");
    expect(email.html).toContain(">Reporté</span>");
    const ar = render(delivery("matchday_results", { language: "ar", payload }));
    expect(ar.text).toContain("- حسنية أكادير – اتحاد طنجة · مؤجلة");
  });

  it("lists a cancelled match as 'annulé'", () => {
    const payload = {
      date: "2026-09-26",
      fixtures: [{ ...early(), status: "cancelled" }],
    };
    expect(render(delivery("matchday_results", { payload })).text).toContain(
      "- AS FAR – RS Berkane · annulé",
    );
    expect(render(delivery("matchday_results", { language: "ar", payload })).text).toContain(
      "· ملغاة",
    );
  });

  it("groups postponed matches apart in the round preview, without a date or time", () => {
    const payload = {
      round: { id: "r", number: 5, name: "Journée 5" },
      fixtures: [
        fixture(RAJA, FAR, "2026-10-03T19:00:00Z"),
        fixture(HUSA, IRT, "2026-10-04T00:00:00Z", { status: "postponed", timeConfirmed: false }),
      ],
    };
    const email = render(delivery("round_preview", { payload }));
    expect(email.text).toContain(
      "Matchs reportés ou annulés\n- Hassania Agadir – Ittihad Tanger · reporté",
    );
    expect(email.text).not.toContain("Dimanche 4 octobre");
  });
});

describe("counts", () => {
  const preview = (count: number, language: EmailLanguage = "fr") => {
    const all = [early(), middle(), derby(), unconfirmed()];
    const fixtures = Array.from({ length: count }, (_, i) => all[i % all.length]!);
    return render(
      delivery("matchday_preview", { language, payload: { date: "2026-09-26", fixtures } }),
    );
  };

  it("uses the singular for one match", () => {
    expect(preview(1).subject).toBe("Aujourd'hui en Botola Pro : 1 match");
    expect(preview(1).text).toContain("1 match au programme aujourd'hui.");
  });

  it("uses the plural for several", () => {
    expect(preview(4).subject).toBe("Aujourd'hui en Botola Pro : 4 matchs");
  });

  it("follows Arabic number agreement", () => {
    expect(preview(1, "ar").subject).toBe("اليوم في البطولة الاحترافية: مباراة واحدة");
    expect(preview(2, "ar").subject).toBe("اليوم في البطولة الاحترافية: مباراتان");
    expect(preview(4, "ar").subject).toBe("اليوم في البطولة الاحترافية: 4 مباريات");
    expect(preview(11, "ar").subject).toBe("اليوم في البطولة الاحترافية: 11 مباراة");
  });

  it("counts points in both languages", () => {
    const pts = (points: number, language: EmailLanguage = "fr") =>
      render(
        delivery("gameweek_finalized", {
          language,
          payload: { gameweek: 5, points, overallRank: null, totalPoints: null },
        }),
      ).subject;
    expect(pts(64)).toBe("Journée 5 : vous avez marqué 64 points");
    expect(pts(1)).toBe("Journée 5 : vous avez marqué 1 point");
    expect(pts(64, "ar")).toBe("الجولة 5: جمعت 64 نقطة");
    expect(pts(7, "ar")).toBe("الجولة 5: جمعت 7 نقاط");
    expect(pts(2, "ar")).toBe("الجولة 5: جمعت نقطتين");
  });
});

describe("time zones", () => {
  it("shows kickoffs in Africa/Casablanca by default (UTC+1 in September)", () => {
    const email = render(delivery("match_starting"));
    expect(email.text).toContain("Coup d'envoi à 21:00 (samedi 26 septembre)");
    expect(email.text).not.toContain("20:00");
  });

  it("uses the delivery's own zone when it differs", () => {
    const email = render(delivery("match_starting", { timezone: "Europe/Paris" }));
    expect(email.text).toContain("Coup d'envoi à 22:00");
    expect(email.text).not.toContain("21:00");
  });

  it("follows Morocco's Ramadan clock change instead of a fixed offset", () => {
    // 1 March 2026 falls in Ramadan: Morocco is on UTC+0.
    const payload = { fixture: fixture(RAJA, WYDAD, "2026-03-01T20:00:00Z"), minutes: 60 };
    expect(render(delivery("match_starting", { payload })).text).toContain(
      "Coup d'envoi à 20:00 (dimanche 1 mars)",
    );
  });

  it("falls back to Africa/Casablanca for an unknown zone", () => {
    expect(resolveTimeZone("Mars/Olympus_Mons")).toBe("Africa/Casablanca");
    expect(resolveTimeZone("")).toBe("Africa/Casablanca");
    expect(resolveTimeZone("Europe/Paris")).toBe("Europe/Paris");
    const email = render(delivery("match_starting", { timezone: "Mars/Olympus_Mons" }));
    expect(email.text).toContain("Coup d'envoi à 21:00");
  });

  it("writes the Fantasy deadline as a day and a 24-hour time", () => {
    const email = render(delivery("deadline_24h"));
    expect(email.subject).toBe("Plus que 24 h pour valider votre équipe Fantasy");
    expect(email.text).toContain("Journée : 5");
    expect(email.text).toContain("Date limite : vendredi 25 septembre à 18:30");
    expect(email.preheader).toBe("Journée 5 · date limite : vendredi 25 septembre à 18:30");
    const ar = render(delivery("deadline_24h", { language: "ar" }));
    expect(ar.html).toContain('<span dir="ltr">18:30</span>');
    expect(ar.text).toMatch(/الموعد النهائي: الجمعة، 25 (شتنبر|سبتمبر) على الساعة 18:30/);
  });
});

describe("match starting", () => {
  it("says '1 heure' for 60 minutes", () => {
    const email = render(delivery("match_starting"));
    expect(email.subject).toBe("Raja Casablanca – Wydad Casablanca commence dans 1 heure");
    const ar = render(delivery("match_starting", { language: "ar" }));
    expect(ar.subject).toBe("تنطلق مباراة الرجاء الرياضي – الوداد الرياضي بعد ساعة");
  });

  it("counts minutes otherwise", () => {
    const payload = { fixture: derby(), minutes: 30 };
    expect(render(delivery("match_starting", { payload })).subject).toBe(
      "Raja Casablanca – Wydad Casablanca commence dans 30 minutes",
    );
    expect(render(delivery("match_starting", { language: "ar", payload })).subject).toBe(
      "تنطلق مباراة الرجاء الرياضي – الوداد الرياضي بعد 30 دقيقة",
    );
  });

  it("links to the match page", () => {
    const payload = { fixture: { ...derby(), id: "fx/42 x" }, minutes: 60 };
    const email = render(delivery("match_starting", { payload }));
    expect(email.html).toContain(`href="${APP}/matches/fx%2F42%20x"`);
    expect(email.text).toContain(`Suivre le match : ${APP}/matches/fx%2F42%20x`);
  });
});

describe("gameweek finalized", () => {
  it("shows total points and overall rank when known", () => {
    const email = render(delivery("gameweek_finalized"));
    expect(email.subject).toBe("Journée 5 : vous avez marqué 64 points");
    expect(email.text).toContain("Points totaux : 312");
    expect(email.text).toContain("Classement général : 12e");
    expect(email.html).toContain("Classement général");
  });

  it("writes first place as 1er", () => {
    const payload = { gameweek: 5, points: 90, overallRank: 1, totalPoints: 400 };
    expect(render(delivery("gameweek_finalized", { payload })).text).toContain(
      "Classement général : 1er",
    );
  });

  it("omits the rank line when the rank is null", () => {
    const payload = { gameweek: 5, points: 64, overallRank: null, totalPoints: 312 };
    for (const language of LANGUAGES) {
      const email = render(delivery("gameweek_finalized", { language, payload }));
      for (const body of [email.html, email.text, email.preheader]) {
        expect(body).not.toContain("Classement général");
        expect(body).not.toContain("الترتيب العام");
      }
    }
  });

  it("omits the totals block entirely when neither figure is known", () => {
    const payload = { gameweek: 5, points: 64, overallRank: null, totalPoints: null };
    const email = render(delivery("gameweek_finalized", { payload }));
    expect(email.text).not.toContain("Points totaux");
    expect(email.preheader).toBe("Découvrez le détail de vos points sur BotolaGO");
  });
});

describe("round preview", () => {
  it("names the round by number and groups matches by day", () => {
    const email = render(delivery("round_preview"));
    expect(email.subject).toBe("Journée 5 de Botola Pro : le programme");
    const days = ["Vendredi 2 octobre", "Samedi 3 octobre", "Dimanche 4 octobre"];
    const positions = days.map((day) => email.text.indexOf(`${day}\n`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(email.text).toContain("Premier coup d'envoi : vendredi 2 octobre à 20:00.");
    expect(render(delivery("round_preview", { language: "ar" })).subject).toBe(
      "الجولة 5 من البطولة الاحترافية: البرنامج",
    );
  });

  it("falls back to the round name when it has no number", () => {
    const payload = {
      round: { id: "r", number: null, name: "Barrages" },
      fixtures: [fixture(RAJA, FAR, "2026-10-03T19:00:00Z")],
    };
    expect(render(delivery("round_preview", { payload })).subject).toBe(
      "Barrages de Botola Pro : le programme",
    );
  });
});

describe("links", () => {
  const allowed = [
    /^https:\/\/botolago\.com\/matches$/,
    /^https:\/\/botolago\.com\/matches\/[A-Za-z0-9%._~-]+$/,
    /^https:\/\/botolago\.com\/fantasy\/transfers$/,
    /^https:\/\/botolago\.com\/fantasy\/points$/,
    /^https:\/\/botolago\.com\/profile$/,
    /^https:\/\/botolago\.com\/unsubscribe\?token=[A-Za-z0-9%._~-]+$/,
  ];
  const expectedCta: Record<EmailNotificationType, string> = {
    matchday_preview: `${APP}/matches`,
    matchday_results: `${APP}/matches`,
    round_preview: `${APP}/matches`,
    match_starting: `${APP}/matches/fx-`,
    deadline_24h: `${APP}/fantasy/transfers`,
    gameweek_finalized: `${APP}/fantasy/points`,
  };

  for (const type of EMAIL_NOTIFICATION_TYPES) {
    for (const language of LANGUAGES) {
      it(`${type} (${language}) links only to allowed routes`, () => {
        const email = render(delivery(type, { language, favoriteTeamId: "raja" }));
        const hrefs = [...email.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!);
        const textUrls = email.text.match(/https?:\/\/\S+/g) ?? [];
        expect(hrefs.length).toBe(3); // the button, manage, unsubscribe
        for (const url of [...hrefs, ...textUrls]) {
          expect(allowed.some((pattern) => pattern.test(url))).toBe(true);
        }
        expect(hrefs[0]!.startsWith(expectedCta[type])).toBe(true);
        expect(textUrls).toContain(hrefs[0]!);
      });
    }
  }
});
