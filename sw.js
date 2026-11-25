// 오프라인용 서비스 워커
// 한 번 인터넷으로 열면 아래 파일들을 태블릿 안에 저장해 두고,
// 그 뒤에는 인터넷이 없어도 저장된 파일로 앱을 연다.
// 파일을 고친 뒤에는 CACHE_VERSION 숫자를 하나 올려 주면 새 버전으로 바뀐다.

const CACHE_VERSION = "v1";
const CACHE_NAME = "jump-rope-dice-" + CACHE_VERSION;
const FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// 설치: 앱 파일을 모두 저장
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

// 활성화: 예전 버전의 저장본 지우기
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("jump-rope-dice-") && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// 요청: 저장본을 바로 보여 주고, 인터넷이 되면 뒤에서 조용히 새 파일로 바꿔 둠
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const fromNetwork = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      if (cached) {
        event.waitUntil(fromNetwork);
        return cached;
      }
      const res = await fromNetwork;
      if (res) return res;
      // 인터넷도 저장본도 없을 때: 페이지 요청이면 첫 화면이라도 보여 줌
      if (req.mode === "navigate") {
        const home = await cache.match("./index.html");
        if (home) return home;
      }
      return new Response("오프라인 상태라 이 파일을 열 수 없어요.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    })
  );
});
