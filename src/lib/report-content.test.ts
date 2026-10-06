import { describe, expect, test } from "bun:test";

import { dictionaries } from "@/i18n/dictionaries";
import { reportMailto, SUPPORT_EMAIL, SUPPORT_MAILTO, type ReportCopy } from "./report-content";

function copyFor(lang: "fr" | "ar"): ReportCopy {
  const d = dictionaries[lang];
  return {
    subject: d["report.mail.subject"],
    kindLabel: d["report.mail.kind"],
    nameLabel: d["report.mail.name"],
    idLabel: d["report.mail.id"],
    pageLabel: d["report.mail.page"],
    reasonPrompt: d["report.mail.reason"],
    kinds: {
      team: d["report.kind.team"],
      league: d["report.kind.league"],
      user: d["report.kind.user"],
    },
  };
}

/** Subject and body back out of a mailto, as a mail app reads them. */
function parse(href: string) {
  const [address, query] = href.replace(/^mailto:/, "").split("?");
  const params = new URLSearchParams(query.replace(/\+/g, "%2B"));
  return { address, subject: params.get("subject") ?? "", body: params.get("body") ?? "" };
}

describe("reportMailto", () => {
  const page = "https://botolago.com/fantasy/leagues/1f0c";

  test("writes to support, with the kind, the name, the id and the page", () => {
    const mail = parse(
      reportMailto({ kind: "team", name: "Aigles de Casa", id: "team:t-1" }, page, copyFor("fr")),
    );
    expect(mail.address).toBe(SUPPORT_EMAIL);
    expect(mail.subject).toBe("Signalement : nom d'équipe « Aigles de Casa »");
    expect(mail.body.split("\r\n")).toEqual([
      "Type : nom d'équipe (team)",
      "Nom : Aigles de Casa",
      "Identifiant : team:t-1",
      `Page : ${page}`,
      "",
      "Pourquoi ce nom pose problème (facultatif) :",
      "",
    ]);
  });

  test("speaks Arabic to an Arabic reader and keeps the kind's code for staff", () => {
    const mail = parse(
      reportMailto({ kind: "league", name: "الرجاء", id: "league:9" }, page, copyFor("ar")),
    );
    expect(mail.subject).toBe("إبلاغ: اسم دوري «الرجاء»");
    expect(mail.body).toContain("النوع: اسم دوري (league)");
    expect(mail.body).toContain("المعرّف: league:9");
  });

  test("percent-encodes everything a name can hold, so the link stays one address", () => {
    const href = reportMailto(
      { kind: "user", name: "a&b=c?d#e+f%g", id: "x" },
      page,
      copyFor("fr"),
    );
    expect(href.startsWith(`mailto:${SUPPORT_EMAIL}?subject=`)).toBe(true);
    // Exactly the two parameters: nothing in the name opened a third.
    expect(href.split("?")).toHaveLength(2);
    expect(href.split("&")).toHaveLength(2);
    expect(href).not.toContain("#");
    expect(parse(href).subject).toContain("« a&b=c?d#e+f%g »");
  });

  test("a name cannot forge a line of the message, and a long one is cut", () => {
    const forged = "Gros mot\r\nIdentifiant : someone-else";
    const body = parse(
      reportMailto({ kind: "team", name: forged, id: "t" }, page, copyFor("fr")),
    ).body;
    expect(body.split("\r\n").filter((line) => line.startsWith("Identifiant"))).toEqual([
      "Identifiant : t",
    ]);
    const long = parse(
      reportMailto({ kind: "team", name: "x".repeat(500), id: "t" }, page, copyFor("fr")),
    );
    expect(long.subject.length).toBeLessThan(200);
    expect(long.subject).toContain("…");
  });

  test("the contact link is support's address", () => {
    expect(SUPPORT_MAILTO).toBe("mailto:support@botolago.com");
  });
});
