import { describe, expect, test } from "bun:test";

import { scoreRelevance } from "./filter";

describe("news engine relevance filter", () => {
  test("accepts a Botola Pro club story in Arabic", () => {
    const decision = scoreRelevance({
      title: "الوداد الرياضي يتعاقد مع لاعب جديد",
      text: "أعلن الوداد الرياضي رسميا التعاقد مع لاعب وسط جديد استعدادا لمباريات البطولة الاحترافية.",
      language: "ar",
    });
    expect(decision.relevant).toBe(true);
    expect(decision.score).toBeGreaterThan(0.5);
  });

  test("accepts a Moroccan national-team story in French", () => {
    const decision = scoreRelevance({
      title: "Les Lions de l'Atlas préparent le match",
      text: "La selection marocaine se prepare pour son prochain match officiel sous la direction du selectionneur.",
      language: "fr",
    });
    expect(decision.relevant).toBe(true);
  });

  test("rejects a foreign-league story with no Moroccan subject", () => {
    const decision = scoreRelevance({
      title: "Manchester City sign a new midfielder",
      text: "The Premier League champions completed a transfer for a midfielder in a deal worth a club record fee.",
      language: "fr",
    });
    expect(decision.relevant).toBe(false);
    expect(decision.reason).toContain("No Botola Pro");
  });

  test("rejects a different sport outright", () => {
    const decision = scoreRelevance({
      title: "بطولة كرة السلة",
      text: "انطلقت منافسات كرة السلة بمشاركة عدة فرق في البطولة الوطنية للعبة.",
      language: "ar",
    });
    expect(decision.relevant).toBe(false);
  });

  test("a transfer with no Moroccan subject is not BotolaGO news", () => {
    // Supporting signals alone must never carry an article.
    const decision = scoreRelevance({
      title: "Un transfert conclu",
      text: "Le club a officialise le transfert du joueur apres plusieurs semaines de negociations et une signature.",
      language: "fr",
    });
    expect(decision.relevant).toBe(false);
  });

  test("a resolved catalog entity is itself sufficient evidence", () => {
    const decision = scoreRelevance({
      title: "Transfer completed",
      text: "The midfielder has signed a three-year contract after negotiations concluded this week.",
      language: "fr",
      resolvedTeamCount: 1,
    });
    expect(decision.relevant).toBe(true);
  });

  test("a CAF story involving a Moroccan club is relevant", () => {
    const decision = scoreRelevance({
      title: "نهضة بركان في دوري ابطال افريقيا",
      text: "يستعد فريق نهضة بركان لخوض مباراة في دوري ابطال افريقيا امام منافسه.",
      language: "ar",
    });
    expect(decision.relevant).toBe(true);
  });

  test("a passing country mention is not a subject", () => {
    // Regression from live ElBotola copy: a Spanish-federation coach renewal
    // that names Morocco once, as a 2030 World Cup co-host, was being kept.
    const decision = scoreRelevance({
      title: "الاتحاد الإسباني يعلن تجديد عقد المدرب لويس دي لا فوينتي",
      text: "أعلن الاتحاد الإسباني لكرة القدم موافقة مجلسه الإداري على تجديد عقد مدرب المنتخب الإسباني حتى سنة 2032، من بينها كأس العالم 2030 المقرر أن تستضيفه إسبانيا إلى جانب البرتغال والمغرب.",
      language: "ar",
    });
    expect(decision.relevant).toBe(false);
  });

  test("a story genuinely about Morocco is kept", () => {
    // Same live batch: repeated mention is what distinguishes a subject from
    // an aside.
    const decision = scoreRelevance({
      title: "الفوزي عن اختياره تمثيل المغرب: قراري نابع من القلب",
      text: "أكد اللاعب أن اختياره تمثيل المغرب جاء عن قناعة، مشيرا إلى أن المنتخب المغربي وجهته المفضلة وأن الجمهور المغربي دعمه. وأضاف أن المغرب بلده وأن اللعب للمنتخب المغربي شرف كبير له.",
      language: "ar",
    });
    expect(decision.relevant).toBe(true);
  });

  test("always explains itself", () => {
    const rejected = scoreRelevance({
      title: "Tennis final",
      text: "A tennis final was played.",
      language: "fr",
    });
    expect(rejected.reason.length).toBeGreaterThan(10);
    expect(rejected.score).toBeGreaterThanOrEqual(0);
    expect(rejected.score).toBeLessThanOrEqual(1);
  });
});
