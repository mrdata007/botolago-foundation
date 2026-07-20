import { NotificationError } from "./errors";

const PLACEHOLDER = /{{([a-z][a-z0-9_]{0,39})}}/g;

export interface NotificationTemplateInput {
  readonly title: string;
  readonly body: string;
  readonly requiredVariables: readonly string[];
  readonly maxTitleLength: number;
  readonly maxBodyLength: number;
  readonly channel: "in_app" | "push" | "email";
}

export interface RenderedNotificationTemplate {
  readonly title: string;
  readonly body: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderNotificationTemplate(
  template: NotificationTemplateInput,
  variables: Readonly<Record<string, string | number>>,
): RenderedNotificationTemplate {
  const expected = new Set(template.requiredVariables);
  for (const key of expected) {
    if (!(key in variables))
      throw new NotificationError("template_variable_missing", `Missing template variable: ${key}`);
  }
  for (const key of Object.keys(variables)) {
    if (!expected.has(key))
      throw new NotificationError("template_variable_missing", `Unknown template variable: ${key}`);
  }
  const replace = (_match: string, key: string) => {
    const raw = String(variables[key] ?? "");
    return template.channel === "email"
      ? escapeHtml(raw)
      : Array.from(raw)
          .filter((character) => {
            const codePoint = character.codePointAt(0) ?? 0;
            return codePoint >= 32 && codePoint !== 127;
          })
          .join("");
  };
  const title = template.title.replace(PLACEHOLDER, replace);
  const body = template.body.replace(PLACEHOLDER, replace);
  if (PLACEHOLDER.test(title) || PLACEHOLDER.test(body))
    throw new NotificationError("template_variable_missing", "Template variables are incomplete.");
  if (title.length > template.maxTitleLength || body.length > template.maxBodyLength)
    throw new NotificationError(
      "template_variable_missing",
      "Rendered template exceeds channel limits.",
    );
  return { title, body };
}
