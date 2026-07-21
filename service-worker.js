// 오늘 뭐 먹지 — 서비스 워커
const CACHE = "todayeat-v3";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isHtml(req) {
  return req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html") ||
    new URL(req.url).pathname.endsWith("/index.html");
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // 실시간 API(/api/)는 캐시하지 않고 항상 네트워크로.
  if (new URL(req.url).pathname.startsWith("/api/")) {
    e.respondWith(fetch(req).catch(() => new Response('{"items":[]}', { headers: { "Content-Type": "application/json" } })));
    return;
  }

  // 앱 화면(HTML)은 네트워크 우선 → 항상 최신. 오프라인이면 캐시로.
  if (isHtml(req)) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put("./index.html", copy));
        return res;
      }).catch(() => caches.match("./index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  // 그 외 정적 파일: 캐시 우선 → 없으면 네트워크 후 저장.
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && (res.type === "basic" || res.type === "cors")) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
