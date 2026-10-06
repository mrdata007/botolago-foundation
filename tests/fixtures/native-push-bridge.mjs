// Runs only in its own Bun process: module mocks never enter the test runner.
import { mock } from "bun:test";
const stub = (name, value) => mock.module(name, () => value);
const React = await import("react");
let effects = [],
  slots = [],
  cursor = 0;
stub("react", {
  ...React,
  useState: () => [true, () => {}],
  useRef: (value) => (slots[cursor++] ??= { current: value }),
  useEffect: (run, deps) => {
    const index = cursor++;
    const previous = slots[index];
    if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i])))
      effects.push(() => {
        previous?.cleanup?.();
        slots[index] = { deps, cleanup: run() };
      });
  },
});
let account = "A",
  push = true,
  now = 10000000;
Date.now = () => now;
const registrations = [],
  foreground = new Set();
const navigate = () => {},
  t = (key) => key;
const queryClient = { invalidateQueries: async () => {} };
stub("@tanstack/react-router", { useNavigate: () => navigate });
stub("@tanstack/react-query", { useQueryClient: () => queryClient });
stub("@/auth/AuthProvider", {
  useAuth: () => ({
    status: account ? "authenticated" : "unauthenticated",
    user: account ? { id: account } : null,
  }),
});
stub("@/i18n/provider", { useI18n: () => ({ lang: "fr", t }) });
stub("@/lib/native-app", { nativePlatform: () => "ios" });
stub("@/services/use-notification-preferences", {
  useMyNotificationPreferences: () => ({ preferences: { channels: { push } } }),
});
stub("@/services/use-my-notifications", { MY_NOTIFICATIONS_QUERY_KEY: ["notifications"] });
stub("@/services/native-push-runtime", { loadNativePushDeps: async () => ({ account }) });
stub("@/services/native-push", {
  ensureAndroidChannels: async () => {},
  refreshRegistration: async (deps) => {
    registrations.push(deps.account);
  },
});
stub("@capacitor/app", {
  App: {
    addListener: async (_, handler) => {
      foreground.add(handler);
      return { remove: async () => foreground.delete(handler) };
    },
  },
});
stub("@capacitor/push-notifications", {
  PushNotifications: {
    addListener: async () => ({ remove: async () => {} }),
  },
});
const { NativePushBridge } = await import("@/components/native/NativePushBridge");
const Component = NativePushBridge().type;
effects = [];
slots = [];
cursor = 0;
const settle = () => new Promise((resolve) => setImmediate(resolve));
const render = async () => {
  cursor = 0;
  Component();
  const pending = effects;
  effects = [];
  pending.forEach((run) => run());
  await settle();
};
const counts = [];
await render();
counts.push(registrations.length);
for (const handler of foreground) handler({ isActive: true });
await settle();
counts.push(registrations.length);
account = null;
await render();
account = "A";
await render();
counts.push(registrations.length);
account = "B";
await render();
counts.push(registrations.length);
now += 30 * 60 * 1000;
for (const handler of foreground) handler({ isActive: true });
await settle();
counts.push(registrations.length);
push = false;
await render();
push = true;
await render();
counts.push(registrations.length);
process.stdout.write(JSON.stringify({ counts, registrations, listeners: foreground.size }));
