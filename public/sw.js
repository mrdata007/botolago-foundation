// BotolaGO service worker: shows a push message and opens its page on tap.
// It caches nothing and intercepts no requests.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = null;
  try {
    payload = event.data ? event.data.json() : null;
  } catch {
    payload = null;
  }
  if (!payload || payload.v !== 1 || typeof payload.title !== "string") return;
  const url =
    typeof payload.url === "string" && payload.url.startsWith("/") ? payload.url : "/notifications";
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: typeof payload.body === "string" ? payload.body : "",
      lang: payload.lang === "ar" ? "ar" : "fr",
      dir: payload.dir === "rtl" ? "rtl" : "ltr",
      tag: typeof payload.tag === "string" ? payload.tag : undefined,
      icon: "/apple-touch-icon.png",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/notifications", self.location.origin)
    .href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ("focus" in client && "navigate" in client) {
          return client.navigate(target).then((c) => (c || client).focus());
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
