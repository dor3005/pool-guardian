const CACHE_NAME = "pool-guardian-v21";

const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",

  "./css/base.css",
  "./css/layout.css",
  "./css/cards.css",
  "./css/water-card.css",
  "./css/responsive.css",

  "./js/mockData.js",
  "./js/dashboard.js",
  "./js/waterLevel.js",
  "./js/fertilizerLevel.js",
  "./js/supabase.js",
  "./js/app.js",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/notification-badge.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );

  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache live Supabase/API responses.
  if (url.origin !== self.location.origin) {
    return;
  }
  if (
    event.request.method !== "GET" ||
    (url.protocol !== "http:" && url.protocol !== "https:")
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const responseCopy = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseCopy);
          });
        }

        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener("push", (event) => {
  let data = {
    title: "Pool Guardian",
    body: "Pool status requires attention",
    status: "ALERT"
  };

  if (event.data) {
    try {
      data = {
        ...data,
        ...event.data.json()
      };
    } catch (error) {
      data.body = event.data.text();
    }
  }

  const options = {
  body: data.body,
  icon: "./assets/icon-192.png",
  badge: "./assets/notification-badge.png",
  color: "#2196F3",
  tag: `pool-${data.status}`,
  renotify: true,
  data: {
    url: "./index.html"
  }
};

  event.waitUntil(
    self.registration.showNotification(
      data.title,
      options
    )
  );
});

self.addEventListener(
  "notificationclick",
  (event) => {
    event.notification.close();

    const appUrl = new URL(
      "./index.html",
      self.location.href
    ).href;

    event.waitUntil(
      clients
        .matchAll({
          type: "window",
          includeUncontrolled: true
        })
        .then((windowClients) => {
          for (const client of windowClients) {
            if (
              client.url.includes(
                "/pool-guardian/app/"
              )
            ) {
              return client.focus();
            }
          }

          return clients.openWindow(appUrl);
        })
    );
  }
);