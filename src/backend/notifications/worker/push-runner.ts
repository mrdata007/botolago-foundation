import type { NotificationDeliveryProvider } from "../provider/contracts";
import { WebPushNotificationProvider } from "../provider/web-push-adapter";
import { vapidKeysMatch } from "../provider/web-push-crypto";
import { dispatchNotificationBatch, type DispatchResult } from "./dispatcher";
import type { NotificationWorkerGateway } from "./gateway.server";

/**
 * One run of the phone-push sender: read the settings, claim a batch of queued
 * push deliveries, send each through the browser's push service, record what
 * happened. It prints counts, never a destination, a key or a message.
 */

export interface PushRunnerEnvironment {
  readonly WEB_PUSH_VAPID_PUBLIC_KEY?: string;
  readonly WEB_PUSH_VAPID_PRIVATE_KEY?: string;
  readonly WEB_PUSH_SUBJECT?: string;
  readonly WEB_PUSH_BATCH_LIMIT?: string;
}

export class PushRunnerConfigurationError extends Error {}

export interface PushRunnerConfiguration {
  readonly publicKey: string;
  readonly privateKey: string;
  readonly subject: string;
  readonly limit: number;
}

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 100;

export function readPushRunnerConfiguration(env: PushRunnerEnvironment): PushRunnerConfiguration {
  const publicKey = env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = env.WEB_PUSH_SUBJECT?.trim() ?? "";
  if (!publicKey || !privateKey)
    throw new PushRunnerConfigurationError("The VAPID public and private keys are not set.");
  if (!vapidKeysMatch({ publicKey, privateKey }))
    throw new PushRunnerConfigurationError("The VAPID private key does not match the public key.");
  if (!/^(mailto:[^\s@]+@[^\s@]+\.[^\s@]+|https:\/\/[^\s]+)$/.test(subject))
    throw new PushRunnerConfigurationError("WEB_PUSH_SUBJECT must be a mailto: or https: contact.");
  const raw = env.WEB_PUSH_BATCH_LIMIT?.trim();
  const limit = raw ? Number(raw) : DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT)
    throw new PushRunnerConfigurationError(`WEB_PUSH_BATCH_LIMIT must be 1 to ${MAX_LIMIT}.`);
  return { publicKey, privateKey, subject, limit };
}

export async function runPushDispatch(
  gateway: NotificationWorkerGateway,
  env: PushRunnerEnvironment,
  options: { fetch?: typeof fetch } = {},
): Promise<DispatchResult> {
  const configuration = readPushRunnerConfiguration(env);
  const provider: NotificationDeliveryProvider = new WebPushNotificationProvider({
    keys: { publicKey: configuration.publicKey, privateKey: configuration.privateKey },
    subject: configuration.subject,
    fetch: options.fetch,
  });
  return dispatchNotificationBatch(
    gateway,
    new Map([[`${provider.channel}:${provider.key}`, provider]]),
    configuration.limit,
  );
}
