const CACHE_NAME = "aqualingua-v3";
const STATIC_ASSETS = [
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

// フェッチ戦略
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

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

  // HTML（ページ本体）→ ネットワーク優先。
  // これをキャッシュ優先にすると、古いHTMLが古いJSを指し続けて
  // 新しいコードが永遠に反映されなくなるため必ずネットワーク優先にする。
  const isHTML =
    request.mode === "navigate" ||
    request.destination === "document" ||
    url.pathname === "/";
  if (isHTML) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/")))
    );
    return;
  }

  // ハッシュ付き静的アセット（JS/CSS/画像/フォント）→ 内容不変なのでキャッシュ優先でOK
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|gif|woff2)$/i)) {
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
