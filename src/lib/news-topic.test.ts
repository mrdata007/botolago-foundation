import { describe, expect, test } from "bun:test";
import { topicForHeadline } from "./news-topic";

describe("headline topics", () => {
  test.each([
    ['جنان الله: "لمَ لا تكرار إنجاز 2022 مع الوداد"', "press"],
    ["أمل تزنيت يعلن منع تنقل جماهير اتحاد طنجة", "fans"],
    ["البارودي وأبرتون يمثلان التحكيم المغربي في كأس العالم", "referee"],
    ["نهضة بركان يعلن تعاقده مع عمر المنصوري بعقد يمتد لثلاثة مواسم", "transfer"],
    ["الرجاء يستأنف تداريبه ويترقب انطلاق مشواره", "training"],
    ["ثلاث غيابات للمغرب الفاسي أمام نهضة الزمامرة", "injury"],
    ["الوداد يعلن انطلاق توزيع بطائق الاشتراك", "fans"],
    ["RS Berkane officialise la signature d'Omar El Mansouri", "transfer"],
    ["Le Maghreb de Fès ouvre les candidatures pour la présidence du club", "club-board"],
    ["Hamza Jenan Allah : « Pourquoi ne pas rééditer l'exploit de 2022 »", "press"],
    ["L'AS FAR fait match nul contre le KAC Kénitra en amical", "training"],
    ["Le Wydad s'impose face au Raja dans le derby", "goal"],
    ["Le stade El Bachir fait son retour", "stadium"],
  ])("%s -> %s", (headline, topic) => {
    expect(topicForHeadline(headline)).toBe(topic as ReturnType<typeof topicForHeadline>);
  });

  test("an injury outranks the match it is about", () => {
    expect(topicForHeadline("Blessure : le capitaine forfait pour le derby")).toBe("injury");
  });

  test("a headline about nothing specific has no topic", () => {
    expect(topicForHeadline("Une nouvelle saison commence")).toBeNull();
    expect(topicForHeadline("")).toBeNull();
    expect(topicForHeadline(undefined)).toBeNull();
  });
});
