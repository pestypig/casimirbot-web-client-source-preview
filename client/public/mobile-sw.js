const CACHE_VERSION = new URL(self.location.href).searchParams.get("v") || "v3";
const CACHE_PREFIX = "helix-mobile-shell-";
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const OFFLINE_ASSETS = [
  "/",
  "/mobile",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/helix-arrow.svg",
  "/loading/helix-loading-mark.svg",
];
const NETWORK_FIRST_DESTINATIONS = new Set(["script", "style", "font"]);

const isBypassPath = (pathname) =>
  pathname === "/healthz" ||
  pathname === "/health" ||
  pathname === "/version" ||
  pathname.startsWith("/api/");

const cacheResponse = (request, response) => {
  if (!response || !response.ok) return;
  caches.open(CACHE_NAME).then((cache) => cache.put(request, response)).catch(() => null);
};

const matchShell = () =>
  caches
    .match("/index.html", { cacheName: CACHE_NAME })
    .then(
      (response) =>
        response ||
        caches
          .match("/mobile", { cacheName: CACHE_NAME })
          .then((mobile) => mobile || caches.match("/", { cacheName: CACHE_NAME })),
    );

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(OFFLINE_ASSETS))
      .catch(() => null),
  );
  self.skipWaiting();
});

self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isBypassPath(url.pathname)) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(JSON.stringify({ error: "offline", message: "Network unavailable." }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          cacheResponse(request, response.clone());
          return response;
        })
        .catch(matchShell),
    );
    return;
  }

  if (NETWORK_FIRST_DESTINATIONS.has(request.destination)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          cacheResponse(request, response.clone());
          return response;
        })
        .catch(() => caches.match(request, { cacheName: CACHE_NAME })),
    );
    return;
  }

  event.respondWith(
    caches.match(request, { cacheName: CACHE_NAME }).then(
      (cached) =>
        cached ||
        fetch(request)
          .then((response) => {
            cacheResponse(request, response.clone());
            return response;
          })
          .catch(() => matchShell()),
    ),
  );
});
