// MicDesk service worker — torna a app instalável e abre rápido mesmo com rede fraca.
// Dados (/api) nunca vêm da cache: estão sempre ao vivo.
const CACHE = 'micdesk-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname === '/health') return;
  // páginas: rede primeiro (sempre a versão mais recente), cache se estiver offline
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put('/', cp)); return r; })
      .catch(() => caches.match('/')));
    return;
  }
  // JS/CSS com versão (?v=) e ícones: cache primeiro
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok && (url.searchParams.has('v') || /\.(png|svg|webmanifest)$/.test(url.pathname))) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); }
    return r;
  })));
});
