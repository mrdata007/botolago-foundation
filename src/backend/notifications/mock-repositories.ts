import type { RepositoryContext } from "@/backend/contracts/repository";
import type {
  NotificationCategory,
  NotificationDeviceRegistrationInput,
  NotificationDeviceRepository,
  NotificationDeviceSummaryDto,
  NotificationEmailUnsubscribeRepository,
  NotificationEmailUnsubscribeOutcome,
  NotificationListInput,
  NotificationPageDto,
  NotificationPreferenceRepository,
  NotificationPreferencesDto,
  NotificationPreferenceUpdate,
  NotificationRepository,
} from "./contracts";
import { NotificationError } from "./errors";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const now = "2030-01-01T12:00:00.000Z";

function requireActor(context: RepositoryContext): void {
  if (!context.actorId)
    throw new NotificationError("notification_access_denied", "Authentication is required.");
}

const cards: NotificationPageDto["items"] = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    type: "match_starting",
    category: "football",
    priority: "normal",
    language: "fr",
    direction: "ltr",
    title: "Le match commence bientôt",
    body: "Wydad – Raja commence dans 15 min.",
    deepLink: { target: "match_detail", entityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
    availableAt: now,
    expiresAt: null,
    readAt: null,
    dismissedAt: null,
    createdAt: now,
  },
];

let preferences: NotificationPreferencesDto = {
  notificationsEnabled: true,
  channels: { inApp: true, push: false, email: true },
  categories: { matchAlerts: true, breakingNews: true, fantasyDeadlines: true },
  timezone: "Africa/Casablanca",
  quietHours: { enabled: false, start: null, end: null },
  digestMode: "immediate",
  fantasyDeadlineOffsetMinutes: 1440,
  language: "fr",
  updatedAt: now,
};

let readIds = new Set<string>();
let devices: NotificationDeviceSummaryDto[] = [];

export function resetNotificationMocks(): void {
  preferences = {
    ...preferences,
    channels: { inApp: true, push: false, email: true },
    quietHours: { enabled: false, start: null, end: null },
    updatedAt: now,
  };
  readIds = new Set();
  devices = [];
}

export class MockNotificationRepository implements NotificationRepository {
  async list(
    input: NotificationListInput,
    context: RepositoryContext,
  ): Promise<NotificationPageDto> {
    requireActor(context);
    const items = cards
      .filter((card) => !input.category || card.category === input.category)
      .map((card) => ({ ...card, readAt: readIds.has(card.id) ? now : card.readAt }));
    return { items, nextCursor: null };
  }
  async unreadCount(
    category: NotificationCategory | null,
    context: RepositoryContext,
  ): Promise<number> {
    return (await this.list({ category }, context)).items.filter((item) => !item.readAt).length;
  }
  async markRead(id: string, read: boolean, context: RepositoryContext): Promise<void> {
    requireActor(context);
    if (!cards.some((card) => card.id === id))
      throw new NotificationError("notification_not_found", "The notification was not found.");
    if (read) readIds.add(id);
    else readIds.delete(id);
  }
  async markAllRead(
    category: NotificationCategory | null,
    context: RepositoryContext,
  ): Promise<number> {
    requireActor(context);
    const selected = cards.filter((card) => !category || card.category === category);
    selected.forEach((card) => readIds.add(card.id));
    return selected.length;
  }
  async dismiss(id: string, _archive: boolean, context: RepositoryContext): Promise<void> {
    await this.markRead(id, true, context);
  }
}

export class MockNotificationPreferenceRepository implements NotificationPreferenceRepository {
  async get(context: RepositoryContext): Promise<NotificationPreferencesDto> {
    requireActor(context);
    return structuredClone(preferences);
  }
  async update(
    input: NotificationPreferenceUpdate,
    language: "fr" | "ar",
    context: RepositoryContext,
  ): Promise<NotificationPreferencesDto> {
    requireActor(context);
    preferences = { ...structuredClone(input), language, updatedAt: now };
    return structuredClone(preferences);
  }
}

/**
 * Any non-empty token unsubscribes the one mock account, so the page can be
 * previewed without a real e-mail.
 */
export class MockNotificationEmailUnsubscribeRepository implements NotificationEmailUnsubscribeRepository {
  async unsubscribe(token: string): Promise<NotificationEmailUnsubscribeOutcome> {
    if (!token.trim()) return { status: "invalid", topic: null };
    preferences = {
      ...preferences,
      channels: { ...preferences.channels, email: false },
      updatedAt: now,
    };
    return { status: "unsubscribed", topic: null };
  }
}

export class MockNotificationDeviceRepository implements NotificationDeviceRepository {
  async register(
    input: NotificationDeviceRegistrationInput,
    context: RepositoryContext,
  ): Promise<NotificationDeviceSummaryDto> {
    requireActor(context);
    const existing = devices.find((device) => device.deviceId === input.deviceId);
    const next = {
      id: existing?.id ?? "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      deviceId: input.deviceId,
      platform: input.platform,
      pushProvider: input.pushProvider,
      appVersion: input.appVersion ?? null,
      locale: input.locale,
      timezone: input.timezone,
      enabled: true,
      lastSeenAt: now,
      invalidatedAt: null,
      createdAt: existing?.createdAt ?? now,
    } satisfies NotificationDeviceSummaryDto;
    devices = [...devices.filter((device) => device.deviceId !== input.deviceId), next];
    return next;
  }
  async list(context: RepositoryContext): Promise<readonly NotificationDeviceSummaryDto[]> {
    requireActor(context);
    return structuredClone(devices);
  }
  async disable(id: string, context: RepositoryContext): Promise<void> {
    requireActor(context);
    devices = devices.map((device) =>
      device.id === id ? { ...device, enabled: false, invalidatedAt: now } : device,
    );
  }
  async unregister(id: string, context: RepositoryContext): Promise<void> {
    requireActor(context);
    devices = devices.filter((device) => device.id !== id);
  }
}

export const MOCK_NOTIFICATION_USER_ID = USER_ID;
