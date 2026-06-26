const CACHE_NAME = "aqualingua-v2";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
];
const API_NO_CACHE = [
  "/api/auth",
  "/api/sync/push",
  "/api/sync/pull",
  "/api/translate",
  "/api/generate-examples",
];

// インストール時に基本アセットをキャッシュ
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// 古いキャッシュを削除
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// フェッチ: API はネットワーク優先、静的アセットはキャッシュ優先
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API エンドポイント → ネットワーク優先（セッション/同期は必ずサーバーと通信）
  if (API_NO_CACHE.some((path) => url.pathname.startsWith(path))) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({ error: "Network unavailable" }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      })
    );
    return;
  }

  // 静的アセット → キャッシュファースト
  if (
    request.method === "GET" &&
    (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|gif|woff2)$/i) || url.pathname === "/")
  ) {
    event.respondWith(
      caches.match(request).then((response) => {
        if (response) return response;
        return fetch(request).then((response) => {
          if (!response || response.status !== 200) {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
          return response;
        });
      })
    );
    return;
  }

  // それ以外 → ネットワーク
  event.respondWith(fetch(request));
});
