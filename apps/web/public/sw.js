// Service Worker: cache-first для картинок опций (admin) и медиа-стрима.
// Версионируем имя кеша, чтобы при изменении формата (например, переход
// на webp + ресайз через ?w=) можно было выкинуть старое.
//
// Cache-first (а не stale-while-revalidate) выбран намеренно: /media/stream
// отдаёт immutable-контент (ключ + параметры ?w=&q= однозначно определяют
// результат), поэтому фоновая ревалидация только зря жгла бы трафик — что
// особенно важно на медленном интернете.
//
// v2: сброс старого кеша с несжатыми/не-webp ответами + увеличенный лимит.
const CACHE_NAME = "media-v2";
const MAX_ENTRIES = 1500;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

function shouldCache(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  // Кешируем стрим медиа из API-прокси и прямые S3-объекты бакета media.
  if (url.pathname.includes("/media/stream")) return true;
  if (url.pathname.includes("/media/proxy")) return true;
  if (url.pathname.includes("/option-images/")) return true;
  return false;
}

async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  const drop = keys.length - MAX_ENTRIES;
  for (let i = 0; i < drop; i++) {
    await cache.delete(keys[i]);
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (!shouldCache(request)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response.ok && response.status === 200) {
          // response.clone() обязателен — тело можно прочитать лишь раз.
          cache.put(request, response.clone()).then(() => trimCache(cache)).catch(() => {});
        }
        return response;
      } catch (err) {
        const fallback = await cache.match(request);
        if (fallback) return fallback;
        throw err;
      }
    })(),
  );
});
