import { createDecipheriv, createECDH, createPublicKey, createVerify, hkdfSync } from "node:crypto";
import { describe, expect, test } from "bun:test";

import {
  base64UrlDecode,
  base64UrlEncode,
  createVapidAuthorization,
  encryptWebPushPayload,
  generateVapidKeys,
  vapidKeysMatch,
} from "./web-push-crypto";

// RFC 8291, appendix A: the worked example every implementation is checked against.
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  senderPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic:
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

/** What a browser does: decrypt a body with its own private key and auth secret. */
function decryptAsBrowser(
  body: Buffer,
  browserPrivate: Buffer,
  browserPublic: Buffer,
  auth: Buffer,
) {
  const salt = body.subarray(0, 16);
  const keyLength = body.readUInt8(20);
  const senderPublic = body.subarray(21, 21 + keyLength);
  const record = body.subarray(21 + keyLength);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(browserPrivate);
  const shared = ecdh.computeSecret(senderPublic);
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), browserPublic, senderPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, auth, info, 32));
  const key = Buffer.from(
    hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16),
  );
  const nonce = Buffer.from(
    hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12),
  );
  const decipher = createDecipheriv("aes-128-gcm", key, nonce);
  decipher.setAuthTag(record.subarray(record.length - 16));
  const padded = Buffer.concat([
    decipher.update(record.subarray(0, record.length - 16)),
    decipher.final(),
  ]);
  return padded.subarray(0, padded.lastIndexOf(2)).toString("utf8");
}

describe("encryptWebPushPayload", () => {
  test("matches the worked example in RFC 8291", () => {
    const body = encryptWebPushPayload({
      payload: Buffer.from(RFC.plaintext, "utf8"),
      userAgentPublicKey: base64UrlDecode(RFC.uaPublic),
      authSecret: base64UrlDecode(RFC.auth),
      senderPrivateKey: base64UrlDecode(RFC.senderPrivate),
      salt: base64UrlDecode(RFC.salt),
    });
    expect(base64UrlEncode(body)).toBe(RFC.body);
  });

  test("a browser holding the matching keys reads it back, in French and Arabic", () => {
    const browser = createECDH("prime256v1");
    browser.generateKeys();
    const auth = Buffer.from("0123456789abcdef");
    for (const text of [
      '{"title":"Le match commence bientôt"}',
      '{"title":"المباراة تبدأ قريبًا"}',
    ]) {
      const body = encryptWebPushPayload({
        payload: Buffer.from(text, "utf8"),
        userAgentPublicKey: browser.getPublicKey(),
        authSecret: auth,
      });
      expect(decryptAsBrowser(body, browser.getPrivateKey(), browser.getPublicKey(), auth)).toBe(
        text,
      );
    }
  });

  test("every message gets its own salt and sender key", () => {
    const browser = createECDH("prime256v1");
    browser.generateKeys();
    const args = {
      payload: Buffer.from("x"),
      userAgentPublicKey: browser.getPublicKey(),
      authSecret: Buffer.alloc(16, 1),
    };
    expect(encryptWebPushPayload(args).equals(encryptWebPushPayload(args))).toBe(false);
  });

  test("refuses malformed keys and an oversized payload", () => {
    const good = createECDH("prime256v1");
    good.generateKeys();
    const base = {
      payload: Buffer.from("x"),
      userAgentPublicKey: good.getPublicKey(),
      authSecret: Buffer.alloc(16),
    };
    expect(() =>
      encryptWebPushPayload({ ...base, userAgentPublicKey: Buffer.alloc(33) }),
    ).toThrow();
    expect(() => encryptWebPushPayload({ ...base, authSecret: Buffer.alloc(8) })).toThrow();
    expect(() => encryptWebPushPayload({ ...base, payload: Buffer.alloc(4000) })).toThrow();
  });
});

describe("VAPID", () => {
  test("a generated pair matches, a mismatched one does not", () => {
    const a = generateVapidKeys();
    const b = generateVapidKeys();
    expect(vapidKeysMatch(a)).toBe(true);
    expect(vapidKeysMatch({ publicKey: a.publicKey, privateKey: b.privateKey })).toBe(false);
    expect(vapidKeysMatch({ publicKey: "x", privateKey: "y" })).toBe(false);
  });

  test("the header carries a token the public key verifies", () => {
    const keys = generateVapidKeys();
    const header = createVapidAuthorization({
      keys,
      subject: "mailto:ops@botolago.com",
      audience: "https://fcm.googleapis.com",
      nowSeconds: 1_800_000_000,
    });
    const match = /^vapid t=([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, token, k] = match!;
    expect(k).toBe(keys.publicKey);
    const [h, c, s] = token.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({
      typ: "JWT",
      alg: "ES256",
    });
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toEqual({
      aud: "https://fcm.googleapis.com",
      exp: 1_800_000_000 + 12 * 3600,
      sub: "mailto:ops@botolago.com",
    });
    const publicBytes = base64UrlDecode(keys.publicKey);
    const publicKey = createPublicKey({
      key: {
        kty: "EC",
        crv: "P-256",
        x: base64UrlEncode(publicBytes.subarray(1, 33)),
        y: base64UrlEncode(publicBytes.subarray(33, 65)),
      },
      format: "jwk",
    });
    const ok = createVerify("SHA256")
      .update(`${h}.${c}`)
      .verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"));
    expect(ok).toBe(true);
  });

  test("a token never lives past 24 hours", () => {
    const header = createVapidAuthorization({
      keys: generateVapidKeys(),
      subject: "mailto:ops@botolago.com",
      audience: "https://fcm.googleapis.com",
      nowSeconds: 1000,
      lifetimeSeconds: 10 * 24 * 3600,
    });
    const claims = JSON.parse(Buffer.from(header.split(".")[1], "base64url").toString());
    expect(claims.exp - 1000).toBe(24 * 3600);
  });
});
