// Pilotage service worker. Registered only in a secure context (https on the phone, localhost on the PC).
// - /api/*, /auth/*, /healthz, /pilotage-ca.crt and anything that isn't a GET: never touched (network only, never cached).
// - /assets/*: content-hashed and immutable, so cache first (fast start on the phone, small cache trimmed on deploys).
// - Page loads: always the network (fresh app and sign-in checks). If the PC can't be reached, an offline page
//   that retries by itself instead of the browser's error screen.
const VERSION = 'v1';
const ASSETS = `pilotage-assets-${VERSION}`;
const MAX_ASSETS = 80;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith('pilotage-') && key !== ASSETS) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

const NEVER = /^\/(api|auth)\/|^\/healthz$|^\/pilotage-ca\.crt$|^\/sw\.js$/;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || NEVER.test(url.pathname)) return;
  if (req.mode === 'navigate') return event.respondWith(page(req));
  if (url.pathname.startsWith('/assets/')) return event.respondWith(asset(req));
});

async function page(req) {
  try {
    return await fetch(req);
  } catch {
    return offline();
  }
}

async function asset(req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') {
    await cache.put(req, res.clone());
    const keys = await cache.keys();
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(k);
  }
  return res;
}

function offline() {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="15"><title>Pilotage is offline</title><meta name="color-scheme" content="light dark">
<style>body{font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1115;color:#e7e9ee}
@media (prefers-color-scheme: light){body{background:#f5f6f8;color:#16181d}.card{background:#fff!important;border-color:#e3e5ea!important}}
.card{max-width:420px;margin:24px 16px;padding:28px;border-radius:16px;background:#171a21;border:1px solid #262a33}
h1{font-size:22px;margin:0 0 8px}p{margin:8px 0;opacity:.85}a{display:inline-block;margin-top:12px;padding:10px 18px;border-radius:999px;background:#7c9cff;color:#0e1014;text-decoration:none;font-weight:600}</style></head>
<body><div class="card"><h1>Pilotage is offline</h1><p>Is your PC on? This phone can't reach it right now.</p>
<p>At home, check the phone is on your home Wi-Fi. Away, check NetBird is connected on both devices.</p>
<p>This page tries again every 15 seconds.</p><a href="">Try again</a></div></body></html>`;
  return new Response(html, {
    status: 200, // 200 so install checks that probe the start page offline still pass
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    },
  });
}
