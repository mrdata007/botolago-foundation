import { describe, expect, test } from "bun:test";
import { NotificationError } from "./errors";
import { renderNotificationTemplate } from "./template";

describe("notification templates", () => {
  test("renders French and Arabic variables deterministically", () => {
    expect(
      renderNotificationTemplate(
        {
          title: "But !",
          body: "{{team}} marque : {{score}}.",
          requiredVariables: ["team", "score"],
          maxTitleLength: 20,
          maxBodyLength: 100,
          channel: "push",
        },
        { team: "الرجاء", score: "2–1" },
      ),
    ).toEqual({ title: "But !", body: "الرجاء marque : 2–1." });
  });

  test("escapes email variables", () => {
    const result = renderNotificationTemplate(
      {
        title: "{{name}}",
        body: "<p>{{name}}</p>",
        requiredVariables: ["name"],
        maxTitleLength: 100,
        maxBodyLength: 200,
        channel: "email",
      },
      { name: '<img src=x onerror="alert(1)">' },
    );
    expect(result.body).not.toContain("<img");
    expect(result.body).toContain("&lt;img");
  });

  test("rejects missing and unknown variables", () => {
    const input = {
      title: "{{team}}",
      body: "{{team}}",
      requiredVariables: ["team"],
      maxTitleLength: 100,
      maxBodyLength: 100,
      channel: "in_app" as const,
    };
    expect(() => renderNotificationTemplate(input, {})).toThrow(NotificationError);
    expect(() => renderNotificationTemplate(input, { team: "WAC", extra: "unsafe" })).toThrow(
      NotificationError,
    );
  });
});
