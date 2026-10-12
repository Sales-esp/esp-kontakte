// Zwei Aufgaben hat dieses Dienstprogramm.
//
// Erstens hält es die App selbst im Gerät, damit sie auch ohne Netz startet.
//
// Zweitens, und das ist der eigentliche Grund: die Oberfläche der Rechner-App
// verweist an hunderten Stellen schlicht auf Logos/x.png, Kartenbilder/y.jpg und
// Formulare/z.jpg. Diese Dateien liegen aber in OneDrive. Statt jede einzelne
// Stelle umzubauen, fängt dieses Programm genau diese Anfragen ab und holt die
// Bilder über Microsoft Graph. Für die Oberfläche sieht es aus, als lägen sie
// weiterhin im Ordner nebenan.
const LAGER = 'esp-kontakte-pc-1';
const BILDLAGER = 'esp-kontakte-bilder-1';
const HUELLE = ['./', './index.html', './manifest.webmanifest',
                './icon-192.png', './icon-512.png', './icon-maskable.png'];
const BILDORDNER = /\/(Logos|Kartenbilder|Formulare)\/(.+)$/;

let ZUGANG = '';
let ORDNER = '';
let warteAufZugang = null;

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(LAGER).then(c => c.addAll(HUELLE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys().then(n => Promise.all(
    n.filter(x => x !== LAGER && x !== BILDLAGER).map(x => caches.delete(x)))));
  self.clients.claim();
});

self.addEventListener('message', ev => {
  const d = ev.data || {};
  if (d.art === 'od'){
    ZUGANG = d.zugang || '';
    ORDNER = d.ordner || '';
    if (warteAufZugang){ warteAufZugang(); warteAufZugang = null; }
  }
  if (d.art === 'bilderWeg') caches.delete(BILDLAGER);
});

// Nach dem Start der Seite dauert es einen Moment, bis das Zugangsmerkmal da
// ist. Statt die ersten Bilder scheitern zu lassen, wird kurz gewartet.
function zugangAbwarten(ms){
  if (ZUGANG) return Promise.resolve(true);
  return new Promise(ok => {
    const t = setTimeout(() => { warteAufZugang = null; ok(!!ZUGANG); }, ms);
    warteAufZugang = () => { clearTimeout(t); ok(true); };
  });
}

function teilKodiert(weg){
  return weg.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

async function bildHolen(unterordner, name){
  const schluessel = unterordner + '/' + name;
  const lager = await caches.open(BILDLAGER);
  const alt = await lager.match(schluessel);
  if (alt) return alt;

  if (!await zugangAbwarten(8000))
    return new Response('nicht angemeldet', {status: 401});

  const wurzel = 'https://graph.microsoft.com/v1.0/me/drive/root:/'
               + teilKodiert(ORDNER + '/' + unterordner + '/' + decodeURIComponent(name));
  // Bewusst ohne $select: sonst fehlt die Herunterladeadresse in der Antwort.
  const e = await fetch(wurzel, {headers: {Authorization: 'Bearer ' + ZUGANG}});
  if (!e.ok) return new Response('nicht gefunden', {status: e.status});
  const d = await e.json();
  const u = d['@microsoft.graph.downloadUrl'];
  if (!u) return new Response('keine Herunterladeadresse', {status: 502});

  const bild = await fetch(u);            // eigene Adresse, ohne Kopfzeile
  if (!bild.ok) return new Response('Bild nicht erreichbar', {status: bild.status});
  lager.put(schluessel, bild.clone()).catch(() => {});
  return bild;
}

self.addEventListener('fetch', ev => {
  const a = new URL(ev.request.url);
  if (ev.request.method !== 'GET' || a.origin !== self.location.origin) return;

  const t = BILDORDNER.exec(a.pathname);
  if (t){
    ev.respondWith(bildHolen(t[1], t[2])
      .catch(() => new Response('Fehler', {status: 500})));
    return;
  }

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
