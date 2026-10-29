import ts from "typescript";
import { readFileSync, writeFileSync } from "node:fs";
import { format } from "prettier";

const source = ts.createSourceFile(
  "database.types.ts",
  readFileSync(
    new URL("../../../src/backend/generated/database.types.ts", import.meta.url),
    "utf8",
  ),
  ts.ScriptTarget.Latest,
  true,
);
const database = source.statements.find(
  (s) => ts.isTypeAliasDeclaration(s) && s.name.text === "Database",
).type;
const member = (type, name) =>
  type.members.find((m) => m.name.getText(source).replaceAll('"', "") === name)?.type;
const functions = member(member(database, "api"), "Functions");

// These are service-role jobs/bootstrap routines, not staff actions. HTML writes
// go through the existing trusted sanitizer Edge Function instead of MAC RPCs.
export const excluded = new Set([
  "admin_bootstrap_first_platform_admin",
  "admin_claim_session_revocations",
  "admin_claim_session_revocations_v2",
  "admin_complete_session_revocation",
  "admin_complete_session_revocation_v2",
  "admin_expire_approvals",
  "admin_fail_session_revocation",
  "admin_finish_session_revocation_worker",
  "admin_replay_session_revocation_dead_letter",
  "admin_start_session_revocation_worker",
  "admin_get_owner_bootstrap_readiness",
  "admin_get_revocation_worker_runtime_status",
  "editorial_create_draft",
  "editorial_update_article",
  "editorial_write_secret_for_service",
]);

function schema(type) {
  if (ts.isUnionTypeNode(type)) return { anyOf: type.types.map(schema) };
  if (ts.isLiteralTypeNode(type)) {
    if (type.literal.kind === ts.SyntaxKind.NullKeyword) return { type: "null" };
    return {
      enum: [
        ts.isStringLiteral(type.literal)
          ? type.literal.text
          : JSON.parse(type.literal.getText(source)),
      ],
    };
  }
  if (ts.isArrayTypeNode(type)) return { type: "array", items: schema(type.elementType) };
  if (ts.isTypeLiteralNode(type)) return objectSchema(type);
  if (ts.isIndexedAccessTypeNode(type)) {
    const pieces = type
      .getText(source)
      .match(/\["([^\"]+)"\]/g)
      ?.map((x) => x.slice(2, -2));
    let target = database;
    for (const piece of pieces ?? []) target = member(target, piece);
    if (!target) throw new Error(`Unsupported enum ${type.getText(source)}`);
    return schema(target);
  }
  if (ts.isTypeReferenceNode(type) && type.typeName.getText(source) === "Json") return {};
  const basic = {
    [ts.SyntaxKind.StringKeyword]: "string",
    [ts.SyntaxKind.NumberKeyword]: "number",
    [ts.SyntaxKind.BooleanKeyword]: "boolean",
  }[type.kind];
  if (basic) return { type: basic };
  throw new Error(`Unsupported type ${type.getText(source)}`);
}
function objectSchema(type) {
  const properties = {},
    required = [];
  if (type.kind !== ts.SyntaxKind.NeverKeyword)
    for (const property of type.members) {
      const name = property.name.getText(source).replaceAll('"', "");
      // PostgreSQL function arguments can be explicitly NULL, including values
      // such as a role with no expiry. Database types omit that distinction;
      // each existing RPC still validates its required identifiers and values.
      properties[name] = { anyOf: [schema(property.type), { type: "null" }] };
      if (!property.questionToken) required.push(name);
    }
  return { type: "object", properties, required, additionalProperties: false };
}
const tools = functions.members
  .filter(
    (m) =>
      /^(admin_|editorial_)/.test(m.name.getText(source)) ||
      m.name.getText(source) === "get_my_staff_context",
  )
  .filter((m) => !excluded.has(m.name.getText(source)))
  .map((m) => {
    const name = m.name.getText(source);
    return {
      name,
      description:
        name.replace(/^(admin_|editorial_)/, "").replaceAll("_", " ") +
        ". Uses your existing BotolaGO staff permissions, MFA, recent-authentication, approval and audit rules. Preserve supplied version/fingerprint/idempotency fields; do not retry a write with a new idempotency key.",
      inputSchema: objectSchema(member(m.type, "Args")),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      rpc: name,
    };
  });
const output = await format(JSON.stringify(tools), { parser: "json", printWidth: 100 });
const path = new URL("../src/rpc-catalog.json", import.meta.url);
if (process.argv.includes("--check")) {
  if (readFileSync(path, "utf8") !== output)
    throw new Error("Admin MCP catalog is stale. Run npm run catalog.");
} else writeFileSync(path, output);
console.log(
  `${tools.length} staff RPC tools; ${excluded.size} internal/alternate-path routines excluded.`,
);
