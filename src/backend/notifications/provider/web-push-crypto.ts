// Web Push, the two parts a sender needs, on Node's own crypto (no package):
//   * the message body, encrypted for one browser (RFC 8291, `aes128gcm`
//     content coding of RFC 8188), and
//   * the VAPID header that tells the push service who is sending (RFC 8292).
//
// Server only. The private key never leaves the process that signs with it.

import {
  createCipheriv,
  createECDH,
  createPrivateKey,
  createSign,
  hkdfSync,
  randomBytes,
  type KeyObject,
} from "node:crypto";

const RECORD_SIZE = 4096;
const MAX_PAYLOAD_BYTES = 3993; // the push services accept 4096 bytes in all

export function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export function base64UrlDecode(text: string): Buffer {
  return Buffer.from(text, "base64url");
}

export interface EncryptionInput {
  /** The text to send (a small JSON document). */
  readonly payload: Uint8Array;
  /** The browser's public key (`keys.p256dh`), 65 bytes, uncompressed. */
  readonly userAgentPublicKey: Uint8Array;
  /** The browser's shared secret (`keys.auth`), 16 bytes. */
  readonly authSecret: Uint8Array;
  /** For tests only: fixed sender key pair and salt. Fresh ones are made when absent. */
  readonly senderPrivateKey?: Uint8Array;
  readonly salt?: Uint8Array;
}

/** The complete request body: salt, record size, sender key, then the encrypted record. */
export function encryptWebPushPayload(input: EncryptionInput): Buffer {
  const { payload, userAgentPublicKey, authSecret } = input;
  if (userAgentPublicKey.length !== 65 || userAgentPublicKey[0] !== 4)
    throw new RangeError("The browser public key must be 65 bytes, uncompressed.");
  if (authSecret.length !== 16) throw new RangeError("The auth secret must be 16 bytes.");
  if (payload.length > MAX_PAYLOAD_BYTES) throw new RangeError("The payload is too large.");

  const sender = createECDH("prime256v1");
  if (input.senderPrivateKey) sender.setPrivateKey(Buffer.from(input.senderPrivateKey));
  else sender.generateKeys();
  const senderPublicKey = sender.getPublicKey();
  const salt = Buffer.from(input.salt ?? randomBytes(16));
  if (salt.length !== 16) throw new RangeError("The salt must be 16 bytes.");

  const sharedSecret = sender.computeSecret(Buffer.from(userAgentPublicKey));
  // RFC 8291 section 3.4: the input keying material mixes both public keys.
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    Buffer.from(userAgentPublicKey),
    senderPublicKey,
  ]);
  const ikm = Buffer.from(hkdfSync("sha256", sharedSecret, Buffer.from(authSecret), keyInfo, 32));
  const contentEncryptionKey = Buffer.from(
    hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0", "utf8"), 16),
  );
  const nonce = Buffer.from(
    hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0", "utf8"), 12),
  );

  // One record: the text, then the 0x02 delimiter that marks the last record.
  const plaintext = Buffer.concat([Buffer.from(payload), Buffer.from([2])]);
  const cipher = createCipheriv("aes-128-gcm", contentEncryptionKey, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(16 + 4 + 1 + senderPublicKey.length);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(senderPublicKey.length, 20);
  senderPublicKey.copy(header, 21);
  return Buffer.concat([header, encrypted]);
}

export interface VapidKeys {
  /** The public key, 65 bytes, base64url: the same string the browser is given. */
  readonly publicKey: string;
  /** The private key, 32 bytes, base64url. A secret: never log it, never commit it. */
  readonly privateKey: string;
}

/** A fresh key pair. The owner runs this once, locally, and stores the private half as a secret. */
export function generateVapidKeys(): VapidKeys {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    publicKey: base64UrlEncode(ecdh.getPublicKey()),
    privateKey: base64UrlEncode(ecdh.getPrivateKey()),
  };
}

function privateKeyObject(keys: VapidKeys): KeyObject {
  const d = base64UrlDecode(keys.privateKey);
  const publicKey = base64UrlDecode(keys.publicKey);
  if (d.length !== 32) throw new RangeError("The VAPID private key must be 32 bytes.");
  if (publicKey.length !== 65 || publicKey[0] !== 4)
    throw new RangeError("The VAPID public key must be 65 bytes, uncompressed.");
  return createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      d: keys.privateKey,
      x: base64UrlEncode(publicKey.subarray(1, 33)),
      y: base64UrlEncode(publicKey.subarray(33, 65)),
    },
    format: "jwk",
  });
}

/** True when the private key really is the one behind the public key. */
export function vapidKeysMatch(keys: VapidKeys): boolean {
  try {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(base64UrlDecode(keys.privateKey));
    return ecdh.getPublicKey().equals(base64UrlDecode(keys.publicKey));
  } catch {
    return false;
  }
}

export interface VapidHeaderInput {
  readonly keys: VapidKeys;
  /** `mailto:` or `https:` contact for the push service to reach us. */
  readonly subject: string;
  /** The push service's origin, e.g. `https://fcm.googleapis.com`. */
  readonly audience: string;
  readonly nowSeconds?: number;
  /** How long the token lives; the push services accept up to 24 hours. */
  readonly lifetimeSeconds?: number;
}

/** The value of the `Authorization` header (RFC 8292, the `vapid` scheme). */
export function createVapidAuthorization(input: VapidHeaderInput): string {
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const lifetime = Math.min(input.lifetimeSeconds ?? 12 * 3600, 24 * 3600);
  const header = base64UrlEncode(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64UrlEncode(
    Buffer.from(JSON.stringify({ aud: input.audience, exp: now + lifetime, sub: input.subject })),
  );
  const signingInput = `${header}.${claims}`;
  const signature = createSign("SHA256")
    .update(signingInput)
    .sign({ key: privateKeyObject(input.keys), dsaEncoding: "ieee-p1363" });
  return `vapid t=${signingInput}.${base64UrlEncode(signature)}, k=${input.keys.publicKey}`;
}
