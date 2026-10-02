// Makes the key pair that web push needs. RUN IT ON YOUR OWN COMPUTER, once.
//
//   bun scripts/backend/generate-vapid-keys.ts
//
// It prints two lines and writes nothing to disk:
//   VITE_WEB_PUSH_PUBLIC_KEY   goes in the website's build settings (public).
//   WEB_PUSH_VAPID_PUBLIC_KEY  the same value, for the sender.
//   WEB_PUSH_VAPID_PRIVATE_KEY goes ONLY in the GitHub environment secrets
//                              (production-admin-activation). Never commit it,
//                              never paste it in a chat or a log.
// A lost private key is replaced by running this again; every phone then has
// to turn notifications on again.

import { generateVapidKeys } from "../../src/backend/notifications/provider/web-push-crypto";

const keys = generateVapidKeys();
console.log(`VITE_WEB_PUSH_PUBLIC_KEY=${keys.publicKey}`);
console.log(`WEB_PUSH_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`WEB_PUSH_VAPID_PRIVATE_KEY=${keys.privateKey}`);
