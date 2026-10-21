// Solo l'app (codice e libreria 3D): le foto dei quadri stanno nel telefono, non qui.
const CACHE = "salotto-v45";
const PACK = "salotto-pack"; // la stanza a foto (grande): separata, così non si riscarica a ogni aggiornamento dell'app
const SHELL = ["./", "index.html", "style.css", "app.js", "scene.js", "objects.js", "room.js", "vendor/three.module.min.js", "vendor/three.core.min.js", "real.js", "walk.js", "vendor/OrbitControls.js", "foto.html", "foto.js", "foto.css", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== PACK).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.includes('/pack/')) { // il pacchetto della stanza è grande: dalla cache, senza riscaricarlo a ogni apertura (il numero ?v= lo rinnova)
    e.respondWith(caches.open(PACK).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok) { for (const k of await c.keys()) await c.delete(k); await c.put(e.request, r.clone()); } // una sola versione alla volta
      return r;
    }));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(e.request);
    const net = fetch(e.request, { cache: "no-cache" }).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit); // senza passare dalla cache HTTP (GitHub Pages: 10 minuti): un aggiornamento appena pubblicato non resta indietro
    return hit || net;
  }));
});
