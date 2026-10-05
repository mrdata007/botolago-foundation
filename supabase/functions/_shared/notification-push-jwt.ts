// Signing the logins the push providers ask for, with the platform's own
// WebCrypto: no library, so it runs the same under Bun (tests) and Deno (the
// Edge Function).
//
//   * Google (FCM): a service-account JWT signed RS256 is exchanged for a
//     short-lived OAuth access token.
//   * Apple (APNs): a provider token, a JWT signed ES256 with the .p8 key, is
//     sent with every request.
//
// Private keys come from Edge Function secrets and live only in memory. Nothing
// here logs or returns a key, a token or a signature.

const encoder = new TextEncoder();

export function base64url(bytes: Uint8Array | string): string {
  const data = typeof bytes === "string" ? encoder.encode(bytes) : bytes;
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The DER bytes inside a PEM block. A secret pasted into a dashboard often
 * arrives with its line breaks written as the two characters `\n`; both forms
 * are read.
 */
export function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN [A-Z ]+-----/, "")
    .replace(/-----END [A-Z ]+-----/, "")
    .replace(/\s+/g, "");
  if (body.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) {
    throw new Error("push_key_unreadable");
  }
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export type JwtAlgorithm = "RS256" | "ES256";

/** Imports a PKCS#8 private key for the algorithm; throws `push_key_unreadable` if it is not one. */
export async function importSigningKey(pem: string, algorithm: JwtAlgorithm): Promise<CryptoKey> {
  try {
    const der = pemToDer(pem);
    const buffer = der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer;
    return await crypto.subtle.importKey(
      "pkcs8",
      buffer,
      algorithm === "RS256"
        ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
        : { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
  } catch {
    throw new Error("push_key_unreadable");
  }
}

/**
 * `header.claims.signature`, each part base64url. ES256's signature is the
 * 64-byte r‖s form JWT wants, which is what WebCrypto's ECDSA produces.
 */
export async function signJwt(
  algorithm: JwtAlgorithm,
  header: Readonly<Record<string, unknown>>,
  claims: Readonly<Record<string, unknown>>,
  key: CryptoKey,
): Promise<string> {
  const signingInput = `${base64url(JSON.stringify({ alg: algorithm, typ: "JWT", ...header }))}.${base64url(JSON.stringify(claims))}`;
  const signature = await crypto.subtle.sign(
    algorithm === "RS256" ? { name: "RSASSA-PKCS1-v1_5" } : { name: "ECDSA", hash: "SHA-256" },
    key,
    encoder.encode(signingInput),
  );
  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}
