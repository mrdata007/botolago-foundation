import { Fragment, type ReactNode } from "react";

/**
 * Renders a translation string that may contain a single `{accent}…{/accent}`
 * span. The span is emphasized with the BotolaGO brand blue. Translators
 * choose the fragment per language so word order and RTL behavior stay
 * correct — never split strings in JS.
 *
 * Example dictionary values:
 *   fr: "Alertes {accent}Fantasy{/accent}"
 *   ar: "تنبيهات {accent}الفانتازي{/accent}"
 *
 * Strings without markers render as plain text — safe drop-in for any title.
 */
export function Trans({
  text,
  className,
  accentClassName = "text-brand",
}: {
  text: string;
  className?: string;
  accentClassName?: string;
}): ReactNode {
  const open = text.indexOf("{accent}");
  const close = text.indexOf("{/accent}");
  if (open === -1 || close === -1 || close < open) {
    return <span className={className}>{text}</span>;
  }
  const before = text.slice(0, open);
  const inside = text.slice(open + "{accent}".length, close);
  const after = text.slice(close + "{/accent}".length);
  return (
    <span className={className}>
      {before && <Fragment>{before}</Fragment>}
      <span className={accentClassName}>{inside}</span>
      {after && <Fragment>{after}</Fragment>}
    </span>
  );
}
