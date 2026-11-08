// Oggetti di prova nella stanza (tavolo, tavolino, sedia, mobile, tappeto, scatola, statua): forme semplici a misura, che si spostano sul pavimento
// e si salvano nel telefono. Lo stato sta qui; app.js gestisce selezione, schede e tocchi sulla scena.
import * as THREE from 'three';
import { ROOM, WALLS } from './room.js';

const $ = (id) => document.getElementById(id);
const KEY = 'salotto.obj.v1', IMG = 'salotto.oimg.'; // elenco degli oggetti / foto (una chiave per foto: l'elenco resta leggero)
const cm = (v) => Math.round(v * 100);
const rad = (d) => (d * Math.PI) / 180;
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const ACCENT = '#ff8a3d';
const LIM = { w: [0.05, 5], d: [0.05, 5], h: [0.01, 3] }; // misure ammesse, in metri

// misure di partenza (m); faces = su quali facce si puo' mettere la foto del prodotto
export const KINDS = {
  table: { label: 'Tavolo', w: 1.6, d: 0.9, h: 0.75, mat: 'rovere', round: true, faces: ['top'] },
  coffee: { label: 'Tavolino', w: 1.0, d: 0.55, h: 0.42, mat: 'noce', round: true, faces: ['top'] },
  chair: { label: 'Sedia', w: 0.45, d: 0.47, h: 0.85, mat: 'rovere', round: false, faces: [] },
  cabinet: { label: 'Mobile', w: 1.2, d: 0.4, h: 0.85, mat: 'bianco', round: false, faces: ['front', 'top'] },
  rug: { label: 'Tappeto', w: 2.0, d: 1.4, h: 0.015, mat: 'beige', round: true, faces: ['top'] },
  box: { label: 'Scatola', w: 1.0, d: 0.6, h: 1.0, mat: 'grigio', round: false, faces: ['front', 'top'] },
  banky: { label: 'Banky Big', w: 0.88, d: 0.51, h: 0.23, mat: 'rame', round: false, faces: [] },        // tavolino Peltia, lamiera piegata (misure del catalogo)
  bankys: { label: 'Banky Small', w: 0.69, d: 0.44, h: 0.17, mat: 'rame', round: false, faces: [] },
  statue: { label: 'Statua', w: 0.5, d: 0.5, h: 2.0, mat: 'marmo', round: false, faces: [] }, // misure del basamento e altezza totale
};
export const MATS = { rovere: ['Rovere', '#c2a47c'], noce: ['Noce', '#5e3d2a'], bianco: ['Bianco', '#e8e6df'], beige: ['Beige', '#d2c7b2'], grigio: ['Grigio', '#868a90'], nero: ['Nero', '#26262a'], rosso: ['Rosso', '#9e302b'], marmo: ['Marmo', '#f1efea'], rame: ['Rame', '#bf9b8b'] };
const LIGHT = 0.8; // le luci della scena sommano piu' di 1: senza questo i colori chiari escono bruciati (il rovere diventava giallo acceso)
const PHOTO_HINT = { table: 'La foto va sul piano: per esempio un marmo o un legno.', coffee: 'La foto va sul piano: per esempio un marmo o un legno.', rug: 'La foto va sopra il tappeto.', cabinet: 'Scegli se metterla davanti o sopra.', box: 'Scegli se metterla davanti o sopra.' };

// ---- misure e posizione ----
const eff = (o) => ({ w: o.w, d: o.round ? o.w : o.d, h: o.h }); // il tavolo rotondo ha un diametro solo
const sizeText = (o) => (o.round ? `Ø ${cm(o.w)} × ${cm(o.h)} cm` : `${cm(o.w)}×${cm(o.d)}×${cm(o.h)} cm`);
function half(o) { // mezza ingombro sugli assi della stanza (con la rotazione)
  const { w, d } = eff(o), a = rad(o.rot), c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  return o.round ? [w / 2, w / 2] : [(c * w + s * d) / 2, (s * w + c * d) / 2];
}
function fit(o) { const [hx, hz] = half(o); o.x = clamp(o.x, hx, ROOM.L - hx); o.z = clamp(o.z, hz, ROOM.W - hz); } // resta dentro la stanza
const wallName = (id) => { const n = WALLS[id].name; return n[0].toLowerCase() + n.slice(1); };
function gapText(o) { // le due pareti piu' vicine
  const [hx, hz] = half(o);
  const g = [['A', o.x - hx], ['W', ROOM.L - o.x - hx], ['T', o.z - hz], ['F', ROOM.W - o.z - hz]].sort((p, q) => p[1] - q[1]).slice(0, 2);
  return g.map(([id, v]) => (v < 0.005 ? `contro la ${wallName(id)}` : `a ${cm(v)} cm dalla ${wallName(id)}`)).join(' · ');
}

// ---- ombra morbida a terra (una per forma, condivisa) ----
const shadows = {};
function shadowTex(round) {
  const k = round ? 'round' : 'rect';
  if (shadows[k]) return shadows[k];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = 'rgba(0,0,0,0.05)';
  for (let i = 0; i < 14; i++) {
    const m = 4 + i * 2; g.beginPath();
    if (round) g.arc(32, 32, 32 - m, 0, Math.PI * 2);
    else if (g.roundRect) g.roundRect(m, m, 64 - 2 * m, 64 - 2 * m, 6); else g.rect(m, m, 64 - 2 * m, 64 - 2 * m); // roundRect manca nei Safari piu' vecchi
    g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (shadows[k] = t);
}

// ---- marmo bianco con venature grigie: disegnato una volta sola, sempre uguale ----
let marble = null;
function marbleTex() {
  if (marble) return marble;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); g.fillStyle = '#f3f1ec'; g.fillRect(0, 0, S, S);
  let r = 20241; const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296); // generatore con seme
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = 0; i < 11; i++) {
    let x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI * 2; const pts = [[x, y]];
    for (let k = 0; k < 26; k++) { a += (rnd() - 0.5) * 0.8; x += Math.cos(a) * 11; y += Math.sin(a) * 11; pts.push([x, y]); }
    for (const [lw, al] of i < 4 ? [[9, 0.05], [3, 0.1]] : [[1.4, 0.2]]) { // le venature grosse sono sfumate, le sottili nette
      g.strokeStyle = `rgba(118,120,132,${al})`; g.lineWidth = lw; g.beginPath(); pts.forEach(([px, py], j) => (j ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
    }
  }
  marble = new THREE.CanvasTexture(c); marble.colorSpace = THREE.SRGBColorSpace; marble.anisotropy = 4;
  return marble;
}

// ---- foto del prodotto: ritaglio al centro per non deformarla ----
function fitTex(tex, ar) {
  const ia = tex.image.width / tex.image.height;
  if (ia > ar) { tex.repeat.set(ar / ia, 1); tex.offset.set((1 - ar / ia) / 2, 0); } else { tex.repeat.set(1, ia / ar); tex.offset.set(0, (1 - ia / ar) / 2); }
}

// ---- forme: tutto in coordinate locali, origine a terra al centro, davanti = +z ----
function build(o, tex) {
  const { w, d, h } = eff(o), g = new THREE.Group();
  const base = new THREE.Color(MATS[o.mat][1]).multiplyScalar(LIGHT);
  const map = o.mat === 'marmo' ? marbleTex() : null;
  const main = new THREE.MeshLambertMaterial({ color: base, map }), dark = new THREE.MeshLambertMaterial({ color: base.clone().multiplyScalar(0.62), map });
  const photo = tex ? new THREE.MeshLambertMaterial({ map: tex, color: new THREE.Color(LIGHT, LIGHT, LIGHT) }) : null;
  const top = photo && o.face === 'top' ? photo : main, front = photo && o.face === 'front' ? photo : main;
  const put = (geo, m, x, y, z) => { const e = new THREE.Mesh(geo, m); e.position.set(x, y, z); e.userData.oid = o.id; g.add(e); return e; };
  const box = (bw, bh, bd, x, y, z, m) => put(new THREE.BoxGeometry(bw, bh, bd), m, x, y, z);
  const drum = (r, ch, x, y, z, side, cap) => { // cilindro: fianco + coperchio a parte (cosi' la foto sopra esce dritta come sulle scatole)
    put(new THREE.CylinderGeometry(r, r, ch, 48, 1, true), side, x, y, z);
    put(new THREE.CircleGeometry(r, 48).rotateX(-Math.PI / 2), cap, x, y + ch / 2, z);
  };
  const m6 = (t, f) => [main, main, t, main, f, main]; // facce della scatola: +x, -x, sopra, sotto, davanti (+z), dietro
  if (photo && o.face === 'top') fitTex(tex, o.round ? 1 : w / d); else if (photo) fitTex(tex, w / h);
  switch (o.kind) {
    case 'table': case 'coffee': {
      const t = 0.03, lh = h - t;
      if (o.round) { drum(w / 2, t, 0, h - t / 2, 0, main, top); put(new THREE.CylinderGeometry(0.05, 0.05, lh, 24), dark, 0, lh / 2, 0); put(new THREE.CylinderGeometry(Math.min(0.25, w / 4), Math.min(0.25, w / 4), 0.02, 32), dark, 0, 0.01, 0); }
      else {
        box(w, t, d, 0, h - t / 2, 0, m6(top, main));
        const ix = Math.min(0.07, w / 4), iz = Math.min(0.07, d / 4);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.05, lh, 0.05, sx * (w / 2 - ix), lh / 2, sz * (d / 2 - iz), dark);
      }
      break;
    }
    case 'chair': {
      const sh = Math.min(0.46, h * 0.55), lw = 0.035;
      box(w, 0.04, d, 0, sh - 0.02, 0, main);                                           // seduta
      box(w, h - sh, 0.03, 0, (h + sh) / 2, -d / 2 + 0.015, main);                      // schienale
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(lw, sh - 0.04, lw, sx * (w / 2 - 0.025), (sh - 0.04) / 2, sz * (d / 2 - 0.025), dark);
      break;
    }
    case 'cabinet': {
      const pl = Math.min(0.08, h / 4);
      box(w - 0.06, pl, d - 0.06, 0, pl / 2, 0, dark);                                  // zoccolo rientrato
      box(w, h - pl, d, 0, pl + (h - pl) / 2, 0, m6(top, front));
      if (!(photo && o.face === 'front')) {                                             // senza foto: anta e maniglie
        if (w >= 0.7) box(0.006, h - pl - 0.06, 0.004, 0, pl + (h - pl) / 2, d / 2 + 0.002, dark);
        for (const sx of w >= 0.7 ? [-0.05, 0.05] : [w * 0.28]) box(0.014, Math.min(0.14, h * 0.2), 0.014, sx, pl + (h - pl) * 0.55, d / 2 + 0.007, dark);
      }
      break;
    }
    case 'statue': { // figura classica in veste lunga su un basamento a tre fasce; il davanti (+z) e' dove guarda
      const ph = Math.min(0.4, h * 0.2), s = (h - ph) / 1.7; // la figura e' disegnata alta 1,7 e scalata
      box(w, ph * 0.3, d, 0, ph * 0.15, 0, main); box(w * 0.84, ph * 0.52, d * 0.84, 0, ph * 0.56, 0, main); box(w * 0.94, ph * 0.18, d * 0.94, 0, ph * 0.91, 0, main);
      // veste: solido di rotazione (orlo svasato, vita, spalle) con pieghe verticali sulla gonna; la giunzione sta dietro
      const prof = [[0.215, 0], [0.222, 0.025], [0.2, 0.12], [0.178, 0.3], [0.158, 0.5], [0.142, 0.68], [0.128, 0.84], [0.113, 0.97], [0.106, 1.04], [0.122, 1.12], [0.14, 1.2], [0.165, 1.27], [0.186, 1.31], [0.17, 1.34], [0.11, 1.365], [0.062, 1.385], [0.048, 1.43], [0.047, 1.48]];
      const lg = new THREE.LatheGeometry(prof.map(([pr, py]) => new THREE.Vector2(pr * s, py * s)), 56), pp = lg.attributes.position;
      for (let k = 0; k < pp.count; k++) {
        const x = pp.getX(k), y = pp.getY(k), z = pp.getZ(k), a = Math.atan2(x, z), f = 1 + 0.075 * Math.max(0, 1 - y / (1.0 * s)) * Math.sin(11 * a + 1.3 * Math.sin(7 * y / s));
        pp.setXYZ(k, x * f, y, z * f);
      }
      lg.computeVertexNormals();
      const robe = put(lg, main, 0, ph, 0); robe.scale.z = 0.74; robe.rotation.y = Math.PI;
      const ball = (x, y, z, sx, sy, sz) => { const m = put(new THREE.SphereGeometry(1, 24, 16), main, x * s, ph + y * s, z * s); m.scale.set(sx * s, sy * s, sz * s); };
      const V = THREE.Vector3, up = new V(0, 1, 0), limb = (a, b, r) => { // braccio: capsula fra due punti
        const pa = new V(...a).multiplyScalar(s), pb = new V(...b).multiplyScalar(s), len = pa.distanceTo(pb);
        const m = put(new THREE.CapsuleGeometry(r * s, Math.max(0.001, len - 2 * r * s), 6, 12), main, 0, 0, 0);
        m.position.copy(pa).add(pb).multiplyScalar(0.5); m.position.y += ph; m.quaternion.setFromUnitVectors(up, pb.sub(pa).normalize());
      };
      for (const sx of [-1, 1]) { // braccia piegate, mani giunte davanti alla vita
        limb([sx * 0.19, 1.3, 0], [sx * 0.205, 1.05, 0.02], 0.037); limb([sx * 0.205, 1.05, 0.02], [sx * 0.035, 1.02, 0.125], 0.031);
        ball(sx * 0.19, 1.29, 0, 0.046, 0.046, 0.046); ball(sx * 0.205, 1.05, 0.02, 0.04, 0.04, 0.04); ball(sx * 0.035, 1.02, 0.125, 0.034, 0.036, 0.034);
      }
      ball(0, 1.55, 0.005, 0.088, 0.112, 0.098);                                       // testa
      ball(0, 1.572, -0.028, 0.092, 0.1, 0.1);                                         // capelli
      ball(0, 1.645, -0.088, 0.045, 0.045, 0.045);                                     // crocchia
      ball(0, 1.538, 0.1, 0.009, 0.017, 0.015);                                        // naso: indica il davanti
      break;
    }
    case 'banky': case 'bankys': { // un'unica lamiera da 4 mm: piano, curva smussata ai lati e piedino che rientra (profilo di fronte, estruso in profondita')
      const f = w / 2, P = [[0, h], [0.86 * f, h], [f, 0.55 * h], [0.94 * f, 0.16 * h], [0.78 * f, 0.02 * h], [0.6 * f, 0]];
      let pts = [...P.slice(1).reverse().map(([x, y]) => [-x, y]), ...P]; // sinistra + destra, dal piedino sinistro al destro
      for (let it = 0; it < 3; it++) { // taglio degli spigoli: le curve della lamiera
        const nx = [pts[0]];
        for (let k = 0; k < pts.length - 1; k++) { const [ax, ay] = pts[k], [bx, by] = pts[k + 1]; nx.push([0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by], [0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by]); }
        nx.push(pts[pts.length - 1]); pts = nx;
      }
      const t = 0.004, outer = [], inner = [];
      pts.forEach(([x, y], k) => {
        const [px, py] = pts[Math.max(0, k - 1)], [qx, qy] = pts[Math.min(pts.length - 1, k + 1)];
        let tx = qx - px, ty = qy - py; const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
        outer.push(new THREE.Vector2(x - ty * t / 2, y + tx * t / 2)); inner.push(new THREE.Vector2(x + ty * t / 2, y - tx * t / 2));
      });
      const shape = new THREE.Shape([...outer, ...inner.reverse()]);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, steps: 1 }).translate(0, 0, -d / 2);
      put(geo, new THREE.MeshLambertMaterial({ color: base, side: THREE.DoubleSide }), 0, 0, 0);
      break;
    }
    case 'rug':
      if (o.round) drum(w / 2, h, 0, h / 2, 0, main, top); else box(w, h, d, 0, h / 2, 0, m6(top, main));
      break;
    default: // scatola: volume pieno, per provare l'ingombro di qualsiasi cosa
      box(w, h, d, 0, h / 2, 0, m6(top, front));
  }
  return g;
}

export function createObjects(ctx) {
  const { scene, camera, render } = ctx;
  let seq = 0, tab = 'move', drag = null, kind = 'table', ostep = 5; // ostep: passo dei tasti in cm
  const nodes = new Map(), texs = new Map();
  const newId = () => 'o' + Date.now().toString(36) + (seq++).toString(36);
  const num = (v, d) => (Number.isFinite(v) ? v : d);

  // ---- salvataggio ----
  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY));
      if (!Array.isArray(v)) return [];
      return v.filter((o) => o && KINDS[o.kind] && MATS[o.mat]).map((o) => {
        const K = KINDS[o.kind], r = {
          id: String(o.id), kind: o.kind, mat: o.mat, round: !!o.round && K.round,
          w: clamp(num(o.w, K.w), ...LIM.w), d: clamp(num(o.d, K.d), ...LIM.d), h: clamp(num(o.h, K.h), ...LIM.h),
          x: num(o.x, ROOM.L / 2), z: num(o.z, ROOM.W / 2), rot: num(o.rot, 0), face: K.faces.includes(o.face) ? o.face : K.faces[0] || null, img: null,
        };
        if (o.photo) { try { r.img = localStorage.getItem(IMG + r.id); } catch { /* senza foto */ } }
        fit(r); return r;
      });
    } catch { return []; }
  }
  let items = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(items.map(({ img, ...r }) => ({ ...r, photo: !!img })))); return true; }
    catch { ctx.showErr('Spazio del telefono pieno: gli oggetti non vengono salvati. Togli qualche foto o oggetto.'); return false; }
  }
  function saveImg(o) {
    try { if (o.img) localStorage.setItem(IMG + o.id, o.img); else localStorage.removeItem(IMG + o.id); return true; }
    catch { o.img = null; ctx.showErr('Spazio del telefono pieno: la foto non si salva. Prova con un\'immagine piu\' piccola.'); return false; }
  }

  // ---- scena ----
  const get = (id) => items.find((o) => o.id === id) || null;
  const cur = () => get(ctx.selected());
  function texFor(o) { // la foto si carica una volta sola e il modello si rifa quando e' pronta
    if (!o.img) { texs.get(o.id)?.tex?.dispose(); texs.delete(o.id); return null; }
    let t = texs.get(o.id);
    if (!t || t.src !== o.img) {
      t?.tex?.dispose(); t = { src: o.img, tex: null }; texs.set(o.id, t);
      new THREE.TextureLoader().load(o.img, (tx) => { tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; if (texs.get(o.id) === t) { t.tex = tx; rebuild(o); } else tx.dispose(); });
    }
    return t.tex;
  }
  function place(o) { const n = nodes.get(o.id); if (!n) return; n.group.position.set(o.x, 0, o.z); n.group.rotation.y = rad(o.rot); render(); }
  function make(o, selected) {
    const { w, d, h } = eff(o), group = new THREE.Group();
    group.add(build(o, texFor(o)));
    if (o.kind !== 'rug') {
      const grow = 0.3, sh = new THREE.Mesh(new THREE.PlaneGeometry(w + grow, d + grow).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTex(o.round), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      sh.position.y = 0.004; sh.renderOrder = 1; group.add(sh);
    }
    const eg = o.round ? new THREE.EdgesGeometry(new THREE.CylinderGeometry(w / 2 + 0.01, w / 2 + 0.01, h + 0.01, 48), 30) : new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.02, h + 0.01, d + 0.02));
    const outline = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: ACCENT }));
    outline.position.y = h / 2 + 0.005; outline.visible = !!selected; group.add(outline);
    scene.add(group); nodes.set(o.id, { group, outline });
    place(o);
  }
  function drop(id) {
    const n = nodes.get(id); if (!n) return;
    scene.remove(n.group);
    n.group.traverse((c) => { c.geometry?.dispose(); if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => m.dispose()); });
    nodes.delete(id);
  }
  function rebuild(o) { const n = nodes.get(o.id); const was = n ? n.outline.visible : false; drop(o.id); make(o, was); render(); }
  items.forEach((o) => make(o, false));

  // ---- punto del pavimento sotto un raggio / dove guarda la vista ----
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3(), dir = new THREE.Vector3();
  const floorPoint = (ray) => (ray.ray.intersectPlane(plane, hit) ? hit : null);
  function viewPoint(size) {
    const p = floorPoint(ctx.viewRay());
    if (p && p.x > 0 && p.x < ROOM.L && p.z > 0 && p.z < ROOM.W) return { x: p.x, z: p.z };
    camera.getWorldDirection(dir); const f = Math.hypot(dir.x, dir.z) || 1;
    const hf = 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect), k = clamp(((size || 0.5) / 2 / Math.tan(hf / 2)) * 1.15 + 0.4, 1.6, 3.6); // se non si vede il pavimento: davanti a chi guarda, tanto lontano da vederlo intero
    return { x: camera.position.x + (dir.x / f) * k, z: camera.position.z + (dir.z / f) * k };
  }
  function viewAxes() { // "avanti" e "destra" della vista, allineati alla stanza (i muri sono paralleli agli assi)
    camera.getWorldDirection(dir); let fx = dir.x, fz = dir.z;
    if (Math.hypot(fx, fz) < 0.3) { dir.set(0, 1, 0).applyQuaternion(camera.quaternion); fx = dir.x; fz = dir.z; } // dall'alto: avanti = verso l'alto dello schermo
    const f = Math.abs(fx) > Math.abs(fz) ? [Math.sign(fx), 0] : [0, Math.sign(fz) || -1];
    return { f, r: [-f[1], f[0]] };
  }

  // ---- azioni ----
  function add(k, size) {
    const K = KINDS[k], o = { id: newId(), kind: k, mat: K.mat, round: false, w: size.w, d: size.d, h: size.h, x: 0, z: 0, rot: 0, face: K.faces[0] || null, img: null };
    const p = viewPoint(Math.max(size.w, size.d)), { f } = viewAxes();
    o.x = p.x; o.z = p.z; o.rot = Math.round((Math.atan2(-f[0], -f[1]) * 180) / Math.PI + 360) % 360; // si presenta con il davanti verso di te
    fit(o); items.push(o); make(o, false); save(); render();
    ctx.select(o.id); ctx.frame(o.id); // si apre la scheda dei comandi e la vista punta sull'oggetto, sopra la scheda
  }
  function move(o, dx, dz) { o.x += dx; o.z += dz; fit(o); place(o); save(); }
  function rotate(o, deg) { o.rot = (((o.rot + deg) % 360) + 360) % 360; fit(o); place(o); save(); }
  function remove(o) { drop(o.id); texs.get(o.id)?.tex?.dispose(); texs.delete(o.id); items = items.filter((x) => x !== o); try { localStorage.removeItem(IMG + o.id); } catch { /* ok */ } save(); render(); }

  // ---- interfaccia: elenco ----
  function renderList(ul, selected, onPick) {
    ul.replaceChildren();
    for (const o of items) {
      const li = document.createElement('li'), b = document.createElement('button'), sm = document.createElement('small');
      b.type = 'button'; b.textContent = label(o); sm.textContent = sizeText(o); b.append(sm);
      if (o.id === selected) b.setAttribute('aria-current', 'true');
      b.onclick = () => onPick(o.id); li.append(b); ul.append(li);
    }
    $('o-empty').hidden = items.length > 0; $('o-clear').hidden = !items.length;
  }
  function label(o) { const same = items.filter((x) => x.kind === o.kind); return KINDS[o.kind].label + (same.length > 1 ? ` ${same.indexOf(o) + 1}` : ''); }

  // ---- interfaccia: modifica dell'oggetto scelto ----
  const press = (sel, on) => document.querySelectorAll(sel).forEach((b) => b.setAttribute('aria-pressed', String(on(b))));
  function syncInfo(o) { $('o-info').textContent = sizeText(o); $('o-gap').textContent = gapText(o); }
  function syncEditor(o) {
    const K = KINDS[o.kind];
    $('o-name').textContent = label(o); syncInfo(o);
    document.querySelectorAll('[data-otab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.otab === tab)));
    document.querySelectorAll('[data-opanel]').forEach((p) => { p.hidden = p.dataset.opanel !== tab; });
    $('o-w').value = cm(o.w); $('o-d').value = cm(o.d); $('o-h').value = cm(o.h);
    $('o-w-l').firstChild.textContent = o.round ? 'Diametro' : 'Larghezza'; $('o-d-l').hidden = o.round;
    $('o-shape').hidden = !K.round; press('[data-shape]', (b) => (b.dataset.shape === 'round') === o.round);
    press('[data-mat]', (b) => b.dataset.mat === o.mat); $('o-mat-name').textContent = MATS[o.mat][0];
    $('o-photo-box').hidden = !K.faces.length; $('o-photo-hint').textContent = PHOTO_HINT[o.kind] || ''; $('o-face').hidden = !(o.img && K.faces.length > 1); $('o-photo-del').hidden = !o.img;
    press('[data-face]', (b) => b.dataset.face === o.face);
    document.querySelectorAll('[data-face]').forEach((b) => { b.hidden = !K.faces.includes(b.dataset.face); });
  }
  let timer = null;
  function applyDims(final) {
    const o = cur(); if (!o) return;
    const read = (id, [a, b], dflt) => { const v = parseFloat($(id).value.replace(',', '.')); return Number.isFinite(v) ? clamp(v / 100, a, b) : dflt; };
    o.w = read('o-w', LIM.w, o.w); o.d = read('o-d', LIM.d, o.d); o.h = read('o-h', LIM.h, o.h);
    fit(o); rebuild(o); save(); syncInfo(o);
    if (final) syncEditor(o);
  }
  ['o-w', 'o-d', 'o-h'].forEach((id) => {
    $(id).addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => applyDims(false), 450); }); // si vede mentre si scrive, senza scatti a ogni cifra
    $(id).addEventListener('change', () => { clearTimeout(timer); applyDims(true); });
  });
  document.querySelectorAll('[data-otab]').forEach((b) => { b.onclick = () => { tab = b.dataset.otab; const o = cur(); if (o) syncEditor(o); }; });
  document.querySelectorAll('[data-onudge]').forEach((b) => {
    b.onclick = () => {
      const o = cur(); if (!o) return;
      const { f, r } = viewAxes(), s = ostep / 100;
      const d = { up: f, down: [-f[0], -f[1]], right: r, left: [-r[0], -r[1]] }[b.dataset.onudge];
      move(o, d[0] * s, d[1] * s); syncInfo(o);
    };
  });
  $('o-step').onclick = () => { ostep = ostep === 1 ? 5 : ostep === 5 ? 20 : 1; $('o-step').textContent = `${ostep} cm`; };
  document.querySelectorAll('[data-orot]').forEach((b) => { b.onclick = () => { const o = cur(); if (o) { rotate(o, Number(b.dataset.orot)); syncInfo(o); } }; });
  $('o-here').onclick = () => {
    const o = cur(); if (!o) return;
    const p = viewPoint(); o.x = p.x; o.z = p.z; fit(o); place(o); save(); syncInfo(o);
  };
  document.querySelectorAll('[data-shape]').forEach((b) => { b.onclick = () => { const o = cur(); if (!o) return; o.round = b.dataset.shape === 'round'; fit(o); rebuild(o); save(); syncEditor(o); }; });
  document.querySelectorAll('[data-mat]').forEach((b) => { b.onclick = () => { const o = cur(); if (!o) return; o.mat = b.dataset.mat; rebuild(o); save(); syncEditor(o); }; });
  document.querySelectorAll('[data-face]').forEach((b) => { b.onclick = () => { const o = cur(); if (!o) return; o.face = b.dataset.face; rebuild(o); save(); syncEditor(o); }; });
  $('o-photo').onchange = async (e) => {
    const o = cur(), f = e.target.files[0]; e.target.value = '';
    if (!o || !f) return;
    try { o.img = await ctx.toDataUrl(f, 900); } catch { ctx.showErr('Non riesco a leggere quella foto.'); return; }
    saveImg(o); rebuild(o); save(); syncEditor(o);
  };
  $('o-photo-del').onclick = () => { const o = cur(); if (!o) return; o.img = null; saveImg(o); rebuild(o); save(); syncEditor(o); };
  $('o-copy').onclick = () => {
    const o = cur(); if (!o) return;
    const c = { ...o, id: newId(), x: o.x + 0.3, z: o.z + 0.3 }; fit(c);
    items.push(c); if (c.img) saveImg(c); make(c, false); save(); render(); ctx.select(c.id);
  };
  $('o-del').onclick = () => { const o = cur(); if (!o || !confirm(`Eliminare "${label(o)}" dalla stanza?`)) return; ctx.select(null); remove(o); ctx.refresh(); };
  $('o-clear').onclick = () => { if (!items.length || !confirm('Togliere tutti gli oggetti dalla stanza? I quadri restano.')) return; ctx.select(null); [...items].forEach(remove); ctx.refresh(); };
  $('o-empty-go').onclick = () => { ctx.openTab('add'); showAdd('object'); };

  // ---- interfaccia: nuovo oggetto ----
  function showAdd(which) {
    press('[data-add]', (b) => b.dataset.add === which);
    $('add-form').hidden = which !== 'painting'; $('obj-form').hidden = which !== 'object';
    ctx.refresh();
  }
  document.querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => showAdd(b.dataset.add); });
  function pickKind(k) {
    kind = k; const K = KINDS[k];
    press('[data-kind]', (b) => b.dataset.kind === k);
    $('n-w').value = cm(K.w); $('n-d').value = cm(K.d); $('n-h').value = cm(K.h);
  }
  document.querySelectorAll('[data-kind]').forEach((b) => { b.onclick = () => pickKind(b.dataset.kind); });
  pickKind('table');
  $('obj-form').onsubmit = (e) => {
    e.preventDefault();
    const K = KINDS[kind], read = (id, [a, b], dflt) => { const v = parseFloat($(id).value.replace(',', '.')); return Number.isFinite(v) ? clamp(v / 100, a, b) : dflt; };
    add(kind, { w: read('n-w', LIM.w, K.w), d: read('n-d', LIM.d, K.d), h: read('n-h', LIM.h, K.h) });
  };

  return {
    items: () => items,
    get,
    pickables: () => { const out = []; for (const n of nodes.values()) n.group.traverse((c) => { if (c.isMesh && c.userData.oid) out.push(c); }); return out; },
    setOutline(id, on) { const n = nodes.get(id); if (n) { n.outline.visible = on; render(); } },
    renderList, syncEditor, syncInfo,
    // trascinare sul pavimento: il punto toccato resta sotto il dito
    beginDrag(id, ray) { const o = get(id), p = o && floorPoint(ray); if (!p) return false; drag = { id, dx: o.x - p.x, dz: o.z - p.z }; return true; },
    dragTo(ray) {
      const o = drag && get(drag.id), p = o && floorPoint(ray); if (!p) return;
      o.x = p.x + drag.dx; o.z = p.z + drag.dz;
      const [hx, hz] = half(o), near = 0.05; // vicino a un muro si appoggia
      if (o.x - hx < near) o.x = hx; else if (ROOM.L - o.x - hx < near) o.x = ROOM.L - hx;
      if (o.z - hz < near) o.z = hz; else if (ROOM.W - o.z - hz < near) o.z = ROOM.W - hz;
      fit(o); place(o); syncInfo(o);
    },
    endDrag() { if (drag) { drag = null; save(); } },
    dragging: () => !!drag,
  };
}
