// Hält die App selbst im Gerät, damit sie auch ohne Netz startet.
// Die Daten kommen weiterhin aus OneDrive, dieser Teil fasst sie nicht an.
const LAGER = 'esp-kontakte-1';
const HUELLE = ['./', './index.html', './manifest.webmanifest',
                './icon-192.png', './icon-512.png', './icon-maskable.png'];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(LAGER).then(c => c.addAll(HUELLE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys().then(n =>
    Promise.all(n.filter(x => x !== LAGER).map(x => caches.delete(x)))));
  self.clients.claim();
});

self.addEventListener('fetch', ev => {
  const a = new URL(ev.request.url);
  // Alles Fremde, vor allem Microsoft, geht unberührt durch
  if (ev.request.method !== 'GET' || a.origin !== self.location.origin) return;
  ev.respondWith((async () => {
    try {
      const frisch = await fetch(ev.request);
      if (frisch && frisch.ok){
        const lager = await caches.open(LAGER);
        lager.put(ev.request, frisch.clone()).catch(() => {});
      }
      return frisch;
    } catch(e){
      const alt = await caches.match(ev.request);
      if (alt) return alt;
      const start = await caches.match('./index.html');
      if (start && ev.request.mode === 'navigate') return start;
      throw e;
    }
  })());
});
