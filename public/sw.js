// Minimal service worker — just enough for installability + a small
// perf win on repeat visits. Deliberately not an offline-first app yet
// (backend-plans.md §13.7): API calls always go to the network so data
// stays live; only same-origin static assets/pages get cached.
const CACHE_NAME = "branch-app-v3";
const OFFLINE = "/offline.html";
const PRECACHE = [OFFLINE, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

// Drop older caches (old builds' chunks) when a new worker takes over.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Navigations (the HTML shell) must be network-first, not cache-first —
  // the shell's script tags reference this build's content-hashed chunk
  // URLs, and every deploy changes those hashes. A cache-first document
  // means a returning visitor can be served last build's shell pointing at
  // chunks that no longer exist, which breaks hydration with no visible
  // error. The cache here is purely a last-resort offline fallback.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
          return response;
        })
        .catch(async () => (await caches.match(event.request)) || caches.match(OFFLINE)),
    );
    return;
  }

  // Static, content-hashed assets (JS/CSS chunks, fonts) are safe cache-first
  // — their URL changes whenever their content does.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

// ---------------------------------------------------------------- push
// Every notification carries the same answer buttons as its inbox card, so
// most asks are answered without opening the app (see src/lib/push.ts).

self.addEventListener("push", (event) => {
  let p = {};
  try {
    p = event.data ? event.data.json() : {};
  } catch {
    p = { title: "Branch", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(p.title || "Branch", {
      body: p.body || "",
      tag: p.tag,
      renotify: false,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      actions: (p.actions || []).slice(0, 2),
      data: { url: p.url || "/inbox", ...(p.data || {}) },
    }),
  );
});

async function post(url, body) {
  const res = await fetch(url, {
    method: url.startsWith("/api/bring/") ? "PATCH" : "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
}

async function answer(action, d) {
  if (action === "rsvp-going" || action === "rsvp-no") {
    return post(`/api/events/${d.eventId}/rsvp`, { status: action === "rsvp-going" ? "going" : "no" });
  }
  if (action === "bring-claim") return post(`/api/bring/${d.itemId}`, { claim: true });
  if (action === "bring-skip") return post("/api/inbox/dismiss", { key: d.askKey });
  if (action && action.startsWith("vote-")) {
    const option = (d.options || [])[Number(action.slice(5))];
    return post(`/api/polls/${d.pollId}/vote`, { option });
  }
  throw new Error("open");
}

async function openApp(url) {
  const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const c of all) {
    if (new URL(c.url).origin === self.location.origin) {
      await c.focus();
      return c.navigate(url);
    }
  }
  return self.clients.openWindow(url);
}

self.addEventListener("notificationclick", (event) => {
  const d = event.notification.data || {};
  event.notification.close();
  event.waitUntil(
    (async () => {
      if (!event.action || event.action === "open") return openApp(d.url || "/inbox");
      try {
        await answer(event.action, d);
        // Tell any open tab to refresh its inbox/RSVPs.
        const all = await self.clients.matchAll({ type: "window" });
        all.forEach((c) => c.postMessage({ type: "answered", key: d.askKey }));
      } catch {
        // Signed out, offline or the ask changed — open it instead.
        return openApp(d.url || "/inbox");
      }
    })(),
  );
});
