// Salotto "a foto": la stanza ricostruita dalle foto reali, caricata da un pacchetto cifrato (AES-GCM).
// Il pacchetto sta nel repo (pubblico) ma si legge solo con la chiave, che sta nel telefono: pareti, pavimento e mobili sono foto di casa.
import * as THREE from 'three';
import { ROOM, WALLS, OPENINGS } from './room.js';

const PACK_URL = 'pack/salotto.bin?v=33'; // alzare il numero quando il pacchetto cambia: la cache del telefono lo rinnova
const KEY_STORE = 'salotto.key';
const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

let memKey = null;
// La chiave arriva nel frammento del link (#k=...): non viaggia mai verso il server. Si salva nel telefono e si toglie dall'indirizzo.
export function readKey() {
  const m = /[#&]k=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (m) {
    memKey = m[1];
    try { localStorage.setItem(KEY_STORE, m[1]); } catch { /* resta in memoria */ }
    try { history.replaceState(null, '', location.pathname + location.search); } catch { /* ok */ }
    return m[1];
  }
  if (memKey) return memKey;
  try { return localStorage.getItem(KEY_STORE); } catch { return null; }
}
export function saveKey(k) {
  const v = String(k || '').trim().replace(/^.*k=/, '');
  if (!/^[A-Za-z0-9_-]{43}$/.test(v)) return false;
  memKey = v;
  try { localStorage.setItem(KEY_STORE, v); } catch { /* ok */ }
  return true;
}
export const hasKey = () => !!readKey();

async function fetchPack(onStatus) {
  onStatus?.('Scarico la stanza…');
  let res;
  try { res = await fetch(PACK_URL); } catch { throw new Error('rete'); }
  if (!res.ok) throw new Error(res.status === 404 ? 'assente' : 'rete');
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  // la lunghezza dichiarata serve solo per la percentuale (con la compressione può non coincidere)
  const len = res.headers.get('content-encoding') ? 0 : Number(res.headers.get('content-length')) || 0;
  const chunks = [];
  let got = 0;
  const rd = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      chunks.push(value); got += value.length;
      if (len && got <= len) onStatus?.(`Scarico la stanza… ${Math.round((got / len) * 100)}%`);
    }
  } catch { throw new Error('rete'); }
  const out = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

async function decryptPack(u8, keyB64) {
  if (u8.length < 40 || String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== 'SLT1') throw new Error('pacchetto');
  let key;
  try { key = await crypto.subtle.importKey('raw', b64u(keyB64), 'AES-GCM', false, ['decrypt']); } catch { throw new Error('chiave'); }
  try { return await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.subarray(4, 16) }, key, u8.subarray(16)); } catch { throw new Error('chiave'); }
}

const FACE = { // origine, destra, su (dal fuori) di ogni faccia di una scatola
  '+z': (a, b) => ({ o: [a[0], a[1], b[2]], r: [1, 0, 0], u: [0, 1, 0], w: b[0] - a[0], h: b[1] - a[1], n: [0, 0, 1], sh: 0.86 }),
  '-z': (a, b) => ({ o: [b[0], a[1], a[2]], r: [-1, 0, 0], u: [0, 1, 0], w: b[0] - a[0], h: b[1] - a[1], n: [0, 0, -1], sh: 0.7 }),
  '+x': (a, b) => ({ o: [b[0], a[1], b[2]], r: [0, 0, -1], u: [0, 1, 0], w: b[2] - a[2], h: b[1] - a[1], n: [1, 0, 0], sh: 0.78 }),
  '-x': (a, b) => ({ o: [a[0], a[1], a[2]], r: [0, 0, 1], u: [0, 1, 0], w: b[2] - a[2], h: b[1] - a[1], n: [-1, 0, 0], sh: 0.78 }),
  '+y': (a, b) => ({ o: [a[0], b[1], b[2]], r: [1, 0, 0], u: [0, 0, -1], w: b[0] - a[0], h: b[2] - a[2], n: [0, 1, 0], sh: 1.0 }),
};

// scatola con gli spigoli smussati (come RoundedBoxGeometry di three, senza dipendenze): per il divano
function roundedGeo(w, h, d, r) {
  r = Math.min(w / 2, h / 2, d / 2, r);
  const n = 5; // dispari: la fascia centrale resta piatta
  const g = new THREE.BoxGeometry(1, 1, 1, n, n, n);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const half = 0.5 / n, v = new THREE.Vector3(), q = new THREE.Vector3();
  const face = new Uint8Array(pos.count); // 0..5 = +x -x +y -y +z -z (come sono costruite le facce di BoxGeometry)
  for (let i = 0; i < pos.count; i++) face[i] = Math.floor(i / ((n + 1) * (n + 1)));
  g.userData.face = face;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    q.set(v.x - Math.sign(v.x) * half, v.y - Math.sign(v.y) * half, v.z - Math.sign(v.z) * half).normalize();
    pos.setXYZ(i, (w / 2 - r) * Math.sign(v.x) + q.x * r, (h / 2 - r) * Math.sign(v.y) + q.y * r, (d / 2 - r) * Math.sign(v.z) + q.z * r);
    nor.setXYZ(i, q.x, q.y, q.z);
  }
  return g;
}
// tinta unita con luce "cotta" nei vertici: più chiaro sopra, più scuro sui fianchi e in basso
function roundedMesh(b) {
  const [a, c] = [b.min, b.max];
  const g = roundedGeo(c[0] - a[0], c[1] - a[1], c[2] - a[2], b.round);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const base = new THREE.Color(b.color), col = new Float32Array(pos.count * 3), hh = c[1] - a[1];
  for (let i = 0; i < pos.count; i++) {
    const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
    const k = (0.7 + 0.36 * Math.max(0, ny) + 0.08 * Math.max(0, -nz) + 0.05 * Math.max(0, -nx)) * (0.8 + 0.2 * Math.min(1, (pos.getY(i) + hh / 2) / 0.2));
    col[i * 3] = Math.min(1, base.r * k); col[i * 3 + 1] = Math.min(1, base.g * k); col[i * 3 + 2] = Math.min(1, base.b * k);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  m.position.set((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2);
  return m;
}

// scatola smussata con le facce prese dall'atlante delle foto (bracciolo): ogni vertice cerca il suo punto sulla faccia di partenza.
// Le facce senza foto prendono il colore del centro della faccia di sopra (sono nascoste da altri pezzi).
const FACE_KEYS = ['+x', '-x', '+y', '-y', '+z', '-z'];
function roundedTexMesh(b, map, aw, ah) {
  const [a, c] = [b.min, b.max];
  const g = roundedGeo(c[0] - a[0], c[1] - a[1], c[2] - a[2], b.round);
  const pos = g.attributes.position, face = g.userData.face, uv = new Float32Array(pos.count * 2);
  const ctr = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
  const rect = (f) => { // [u0, v0, u1, v1] di una faccia nell'atlante (v = 0 in basso)
    const r = b.faces[f];
    return r ? [(r[0] + 0.5) / aw, 1 - (r[3] - 0.5) / ah, (r[2] - 0.5) / aw, 1 - (r[1] + 0.5) / ah] : null;
  };
  const spare = (() => { const t = rect('+y') || rect(Object.keys(b.faces)[0]); return [(t[0] + t[2]) / 2, (t[1] + t[3]) / 2]; })();
  for (let i = 0; i < pos.count; i++) {
    const f = FACE_KEYS[face[i]], R = rect(f);
    if (!R) { uv[i * 2] = spare[0]; uv[i * 2 + 1] = spare[1]; continue; }
    const d = FACE[f](a, c), p = [pos.getX(i) + ctr[0] - d.o[0], pos.getY(i) + ctr[1] - d.o[1], pos.getZ(i) + ctr[2] - d.o[2]];
    const s = Math.min(1, Math.max(0, (p[0] * d.r[0] + p[1] * d.r[1] + p[2] * d.r[2]) / d.w));
    const t = Math.min(1, Math.max(0, (p[0] * d.u[0] + p[1] * d.u[1] + p[2] * d.u[2]) / d.h));
    uv[i * 2] = R[0] + (R[2] - R[0]) * s; uv[i * 2 + 1] = R[1] + (R[3] - R[1]) * t;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map, toneMapped: false }));
  m.position.set(ctr[0], ctr[1], ctr[2]);
  return m;
}

// piccoli oggetti fatti a mano: cilindro verticale, scatola, cilindro orizzontale (bottiglia), solido di rotazione con un colore per anello (vaso),
// cilindro cavo con la foto intorno (vaso rosso del vano), mesh a colori per vertice (mensole, pianta, vasi, fumetti: B(nome) legge il blocco binario)
function primMesh(p, T = {}, B = null) {
  const basic = (o = {}) => new THREE.MeshBasicMaterial({ color: p.color, toneMapped: false, ...o });
  let m;
  if (p.t === 'cyl') {
    m = new THREE.Mesh(new THREE.CylinderGeometry(p.r1, p.r0, p.h, 16), basic());
    m.position.set(p.p[0], p.p[1] + p.h / 2, p.p[2]);
  } else if (p.t === 'box') {
    m = new THREE.Mesh(new THREE.BoxGeometry(p.max[0] - p.min[0], p.max[1] - p.min[1], p.max[2] - p.min[2]), basic());
    m.position.set((p.min[0] + p.max[0]) / 2, (p.min[1] + p.max[1]) / 2, (p.min[2] + p.max[2]) / 2);
  } else if (p.t === 'hcyl') {
    const g = new THREE.CylinderGeometry(p.r, p.r, p.len, 16);
    if (p.axis === 'x') g.rotateZ(Math.PI / 2); else g.rotateX(Math.PI / 2);
    m = new THREE.Mesh(g, basic());
    m.position.set(...p.p);
  } else if (p.t === 'lathe') {
    const n = p.prof.length, seg = p.seg || 24;
    const g = new THREE.LatheGeometry(p.prof.map(([r, y]) => new THREE.Vector2(r, y)), seg);
    const col = new Float32Array(g.attributes.position.count * 3), c = new THREE.Color();
    for (let i = 0; i <= seg; i++) for (let j = 0; j < n; j++) { c.set(p.prof[j][2]); const k = (i * n + j) * 3; col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide }));
    m.position.set(...p.p);
  } else if (p.t === 'cylt') {
    // parete fuori con la texture (la foto del vaso, u = angolo da +z verso +x), parete dentro scura, bordo chiaro e fondo; l'origine e' la base
    const seg = 40, r = p.r, h = p.h, wall = 0.004;
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg, 1, true), new THREE.MeshBasicMaterial(T[p.map] ? { map: T[p.map], toneMapped: false } : { color: '#7a0a10', toneMapped: false }));
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(r - wall, r - wall, h, seg, 1, true), new THREE.MeshBasicMaterial({ color: p.inner, side: THREE.BackSide, toneMapped: false }));
    const rim = new THREE.Mesh(new THREE.RingGeometry(r - wall, r, seg), new THREE.MeshBasicMaterial({ color: p.rim, side: THREE.DoubleSide, toneMapped: false }));
    rim.rotation.x = -Math.PI / 2; rim.position.y = h / 2 + 0.0005;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(r - wall, seg), new THREE.MeshBasicMaterial({ color: p.inner, toneMapped: false }));
    bottom.rotation.x = -Math.PI / 2; bottom.position.y = -h / 2 + 0.01;
    m = new THREE.Group(); m.add(outer, inner, rim, bottom);
    m.position.set(p.p[0], p.p[1] + h / 2, p.p[2]);
  } else if (p.t === 'vmesh' && B) {
    // posizioni float32 (nv*3), colori uint8 sRGB (nv*3, riempiti a 4 byte), [uv float32 (nv*2)], indici uint16 (ni): le ombre sono gia' nei colori;
    // con `map` la texture si moltiplica ai colori, con `amap` (maschera) i bordi si ritagliano, con `alpha` la mesh e' trasparente (vetro)
    const buf = B(p.bin), nv = p.nv, ni = p.ni;
    const cOff = nv * 12, uOff = cOff + ((nv * 3 + 3) & ~3), iOff = uOff + (p.uv ? nv * 8 : 0);
    const pos = new Float32Array(buf, 0, nv * 3), cb = new Uint8Array(buf, cOff, nv * 3), idx = new Uint16Array(buf, iOff, ni);
    const col = new Float32Array(nv * 3), c = new THREE.Color();
    for (let i = 0; i < nv; i++) { c.setRGB(cb[i * 3] / 255, cb[i * 3 + 1] / 255, cb[i * 3 + 2] / 255, THREE.SRGBColorSpace); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos.slice(), 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (p.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(buf, uOff, nv * 2).slice(), 2));
    g.setIndex(new THREE.BufferAttribute(idx.slice(), 1));
    const o = { vertexColors: true, toneMapped: false, side: THREE.DoubleSide };
    if (p.map && T[p.map]) o.map = T[p.map];
    if (p.amap && T[p.amap]) { T[p.amap].colorSpace = THREE.NoColorSpace; o.alphaMap = T[p.amap]; o.alphaTest = p.atest ?? 0.5; }
    if (p.alpha) { o.transparent = true; o.opacity = p.alpha; o.depthWrite = false; }
    m = new THREE.Mesh(g, new THREE.MeshBasicMaterial(o));
    if (p.alpha) m.renderOrder = 2;
  } else m = new THREE.Group();
  return m;
}

// parete con i buchi dei passaggi: pezzi di piano (sinistra, destra, sopra) con le coordinate texture della parete intera
function wallWithHoles(w, ops) {
  const pos = [], uv = [], idx = [];
  const rect = (ua, ub, ya, yb) => {
    if (ub - ua < 0.005 || yb - ya < 0.005) return;
    const i0 = pos.length / 3;
    for (const [u, y] of [[ua, ya], [ub, ya], [ub, yb], [ua, yb]]) { pos.push(u, y, 0); uv.push(u / w.len, y / ROOM.H); }
    idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  };
  // si taglia la parete in strisce verticali ai bordi dei buchi; in ogni striscia restano i pezzi fra un buco e l'altro (buchi sovrapposti in larghezza, come la finestra e la nicchia sotto)
  const us = [...new Set([0, w.len, ...ops.flatMap((o) => [o.u0, o.u1])])].sort((a, b) => a - b);
  for (let i = 0; i + 1 < us.length; i++) {
    const ua = us[i], ub = us[i + 1], mid = (ua + ub) / 2;
    let y = 0;
    for (const [a, b] of ops.filter((o) => o.u0 <= mid && mid <= o.u1).map((o) => [o.y0, o.y1]).sort((p, q) => p[0] - q[0])) { rect(ua, ub, y, a); y = Math.max(y, b); }
    rect(ua, ub, y, ROOM.H);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
// profondita' dell'arco: stipiti e architrave in intonaco, corridoio che si scurisce e, in fondo, la foto sfocata del corridoio (a ~1 m dal muro).
// `flat` e' la versione piatta (la foto dell'apertura sul piano del muro) per quando si guarda da fuori la stanza
function archParts(w, o, wallTex, real = false) {
  const deep = [], d = 0.25, run = 0.8, W = o.u1 - o.u0, h = o.y1;
  const win = (geo, u0, uw, hh) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (u0 + uv.getX(i) * uw) / w.len, (uv.getY(i) * hh) / ROOM.H); };
  const mk = (geo, mat, x, y, z, rx = 0, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); deep.push(m); return m; };
  const plaster = (k) => new THREE.MeshBasicMaterial({ color: new THREE.Color('#e6e3dc').multiplyScalar(k), toneMapped: false });
  const fg = new THREE.PlaneGeometry(W, h); win(fg, o.u0, W, h);
  const flat = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ map: wallTex, toneMapped: false }));
  flat.position.set((o.u0 + o.u1) / 2, h / 2, 0);
  if (real) return { deep, flat };      // il corridoio vero (imbotte compreso) sta nel pacchetto, nelle parti 'deep' dei prim: qui resta solo la foto piatta per le viste da fuori
  mk(new THREE.PlaneGeometry(d, h), plaster(0.93), o.u0, h / 2, -d / 2, 0, Math.PI / 2);           // stipite sinistro (normale verso +u: dentro l'apertura)
  mk(new THREE.PlaneGeometry(d, h), plaster(0.86), o.u1, h / 2, -d / 2, 0, -Math.PI / 2);          // stipite destro
  mk(new THREE.PlaneGeometry(W, d), plaster(0.80), (o.u0 + o.u1) / 2, h, -d / 2, Math.PI / 2, 0);  // architrave (normale in basso)
  // corridoio: pareti, soffitto e pavimento che sfumano verso il buio
  const tunnel = (geo, near, far, x, y, z, rx, ry, along) => {
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c0 = new THREE.Color(near), c1 = new THREE.Color(far), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { const t = Math.min(1, Math.max(0, along(pos.getX(i), pos.getY(i)))); c.copy(c0).lerp(c1, t); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    mk(geo, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), x, y, z, rx, ry);
  };
  const zc = -d - run / 2;
  tunnel(new THREE.PlaneGeometry(run, h), '#5b5750', '#171614', o.u0, h / 2, zc, 0, Math.PI / 2, (x) => 0.5 + x / run);    // l'asse x locale va verso -z: il fondo e' +x
  tunnel(new THREE.PlaneGeometry(run, h), '#4f4b45', '#141312', o.u1, h / 2, zc, 0, -Math.PI / 2, (x) => 0.5 - x / run);
  tunnel(new THREE.PlaneGeometry(W, run), '#4a4640', '#121110', (o.u0 + o.u1) / 2, h, zc, Math.PI / 2, 0, (x, y) => 0.5 - y / run);
  tunnel(new THREE.PlaneGeometry(W, run), '#3b3834', '#0e0d0c', (o.u0 + o.u1) / 2, 0.003, zc, -Math.PI / 2, 0, (x, y) => 0.5 + y / run);
  // fondo: la porzione di parete con l'apertura (foto sfocata dalle viste in cui si intravede il corridoio), scurita
  const bg = new THREE.PlaneGeometry(W, h); win(bg, o.u0, W, h);
  mk(bg, new THREE.MeshBasicMaterial({ map: wallTex, color: '#b9b4ab', toneMapped: false }), (o.u0 + o.u1) / 2, h / 2, -d - run);
  return { deep, flat };
}

// velluto a coste (i cuscini del divano): righe sottili chiare e scure, ripetute
let ribTex = null;
function ribTexture() {
  if (ribTex) return ribTex;
  const c = document.createElement('canvas');
  c.width = 16; c.height = 4;
  const g = c.getContext('2d');
  for (let x = 0; x < 16; x++) {
    const k = 0.90 + 0.10 * Math.cos((x / 16) * Math.PI * 2); // una costa ogni ~1,2 cm
    g.fillStyle = `rgb(${Math.round(255 * k)},${Math.round(255 * k)},${Math.round(255 * k)})`;
    g.fillRect(x, 0, 1, 4);
  }
  ribTex = new THREE.CanvasTexture(c);
  ribTex.wrapS = ribTex.wrapT = THREE.RepeatWrapping;
  ribTex.repeat.set(70, 1);
  ribTex.colorSpace = THREE.SRGBColorSpace;
  ribTex.anisotropy = 4;
  return ribTex;
}

// cuscino: superellissoide (gonfio al centro, spigoli morbidi) con la luce "cotta" nei vertici secondo la direzione vera della normale
function pillowMesh(it) {
  const [w, h, d] = it.size, e = it.puff || 0.62;
  const g = new THREE.SphereGeometry(1, 28, 18);
  const pos = g.attributes.position;
  const q = it.q ? new THREE.Quaternion(...it.q) : new THREE.Quaternion().setFromEuler(new THREE.Euler(0, it.ry || 0, it.rz || 0, 'YXZ'));
  const base = new THREE.Color(it.color), col = new Float32Array(pos.count * 3), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    n.set(x, y, z).normalize();
    const sx = Math.sign(x) * Math.pow(Math.abs(x), e), sy = Math.sign(y) * Math.pow(Math.abs(y), e), sz = Math.sign(z) * Math.pow(Math.abs(z), e);
    pos.setXYZ(i, sx * w / 2, sy * h / 2, sz * d / 2);
    // normale del superellissoide ~ normale della sfera scalata inversamente: abbastanza per l'ombreggiatura
    n.set(n.x / w, n.y / h, n.z / d).normalize().applyQuaternion(q);
    const k = 0.66 + 0.40 * Math.max(0, n.y) + 0.06 * Math.max(0, -n.z) - 0.10 * Math.max(0, -n.y);
    col[i * 3] = Math.min(1, base.r * k); col[i * 3 + 1] = Math.min(1, base.g * k); col[i * 3 + 2] = Math.min(1, base.b * k);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, map: it.rib ? ribTexture() : null, toneMapped: false }));
  m.position.set(...it.c);
  m.quaternion.copy(q);
  return m;
}

// oggetti morbidi inclinati (cuscini): scatola smussata centrata, ruotata (quaternione `q` oppure ry/rz); `rib`: velluto a coste; `pillow`: forma da cuscino
function softItem(it) {
  if (it.pillow) return pillowMesh(it);
  const h = [it.size[0] / 2, it.size[1] / 2, it.size[2] / 2];
  const m = roundedMesh({ min: [-h[0], -h[1], -h[2]], max: h, color: it.color, round: it.round || 0.05 });
  if (it.rib) m.material = new THREE.MeshBasicMaterial({ vertexColors: true, map: ribTexture(), toneMapped: false });
  m.position.set(...it.c);
  if (it.q) m.quaternion.set(...it.q); else m.rotation.set(0, it.ry || 0, it.rz || 0, 'YXZ');
  return m;
}

function ceilingTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 8, 64, 64, 90);
  gr.addColorStop(0, '#f5f3ee'); gr.addColorStop(1, '#e4e1da');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createReal(ctx) {
  const { renderer, roomRoot, groups, pieces, render } = ctx;
  const group = new THREE.Group();
  group.visible = false;
  roomRoot.add(group);
  const corrGroup = new THREE.Group(); // il disimpegno dietro l'arco: sta a parte (non nel gruppo del muro TV, che sparisce guardando dal corridoio) e si vede da dentro la stanza e da dentro il disimpegno
  corrGroup.visible = false;
  group.add(corrGroup);
  // il modello a blocchi si nasconde quando si guarda la stanza a foto (i quadri restano); travi, binari e cornicione si rifanno qui
  const gset = new Set(Object.values(groups));
  const blockTop = roomRoot.children.filter((o) => o !== group && !gset.has(o) && !o.userData.keep);
  const blockWall = Object.values(groups).flatMap((g) => g.children.filter((o) => !o.userData.keep));
  const wallMeshes = [], wallObjs = [];
  const archSets = []; // archi: parti con profondita' (da dentro la stanza) e versione piatta (da fuori)
  let archDeep = false;
  const applyArch = () => { for (const a of archSets) { a.deep.forEach((m) => { m.visible = on && archDeep; }); a.flat.visible = on && !archDeep; } corrGroup.visible = on && archDeep; };
  const arts = {};
  let pack = null, loading = null, on = false;
  const loader = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const tex = async (blob) => {
    const url = URL.createObjectURL(blob);
    try {
      const t = await loader.loadAsync(url);
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
      return t;
    } finally { URL.revokeObjectURL(url); }
  };

  // travi (posizioni e misure dalle foto), binari con i faretti e cornicione: non illuminati, con una sfumatura fissa per faccia
  function buildCeilingStuff(parent) {
    const base = new THREE.Color('#efede8');
    const mk = (k) => new THREE.MeshBasicMaterial({ color: base.clone().multiplyScalar(k), toneMapped: false });
    const black = new THREE.MeshBasicMaterial({ color: '#0f0f11', toneMapped: false });
    const warm = new THREE.MeshBasicMaterial({ color: '#fff0cc', toneMapped: false });
    const BEAM = { w: 0.33, drop: 0.14 };
    for (const cx of [2.08, 4.92]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(BEAM.w, BEAM.drop, ROOM.W), [mk(0.86), mk(0.82), mk(0.97), mk(0.97), mk(0.9), mk(0.9)]);
      beam.position.set(cx, ROOM.H - BEAM.drop / 2, ROOM.W / 2);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.028, ROOM.W - 0.9), black);
      rail.position.set(cx, ROOM.H - BEAM.drop - 0.014, ROOM.W / 2);
      parent.add(beam, rail);
      for (let i = 0; i < 4; i++) {
        const z = 0.95 + i * 0.85;
        const spot = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.034, 0.13, 14), black);
        spot.position.set(cx, ROOM.H - BEAM.drop - 0.09, z);
        spot.rotation.x = i % 2 ? 0.5 : -0.5;
        const tip = new THREE.Mesh(new THREE.CircleGeometry(0.03, 14), warm);
        tip.position.set(0, -0.0655, 0); tip.rotation.x = Math.PI / 2;
        spot.add(tip);
        parent.add(spot);
      }
    }
    const cm = mk(0.96);
    for (const [w, x, z, ry] of [[ROOM.L, ROOM.L / 2, 0.035, 0], [ROOM.L, ROOM.L / 2, ROOM.W - 0.035, 0], [ROOM.W, 0.035, ROOM.W / 2, Math.PI / 2], [ROOM.W, ROOM.L - 0.035, ROOM.W / 2, Math.PI / 2]]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.07), cm);
      c.position.set(x, ROOM.H - 0.05, z); c.rotation.y = ry;
      parent.add(c);
    }
  }

  // divano: campo di quote a 2 cm (dalla scansione 3D) con la texture ricavata dalle foto; i fianchi scendono verso il pavimento
  function buildSofa(man, plain, base, T) {
    const s = man.sofa, im = man.images[s.h];
    const H = new Uint16Array(plain.slice(base + im.o, base + im.o + im.n));
    const { nx, nz, cell, x0, z0, ymax } = s;
    const hy = (i, j) => (i < 0 || j < 0 || i >= nx || j >= nz ? 0 : H[j * nx + i] * (ymax / 65535));
    const pos = [], uv = [], idx = [], vid = new Int32Array(nx * nz).fill(-1);
    const W = nx * cell, D = nz * cell;
    const vert = (i, j) => {
      let k = vid[j * nx + i];
      if (k < 0) {
        k = pos.length / 3; vid[j * nx + i] = k;
        const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell;
        pos.push(x, hy(i, j), z); uv.push((x - x0) / W, 1 - (z - z0) / D);
      }
      return k;
    };
    const quad = (i, j) => i >= 0 && j >= 0 && i < nx - 1 && j < nz - 1 && hy(i, j) > 0 && hy(i + 1, j) > 0 && hy(i, j + 1) > 0 && hy(i + 1, j + 1) > 0;
    const sk = { pos: [], col: [], idx: [] };
    const top = new THREE.Color(s.skirt || '#3a3c3f'), bot = top.clone().multiplyScalar(0.35);
    const skirt = (p, q) => { // p, q = [x, y, z] del bordo superiore
      const yb = 0.06, i0 = sk.pos.length / 3;
      sk.pos.push(p[0], p[1], p[2], q[0], q[1], q[2], q[0], yb, q[2], p[0], yb, p[2]);
      sk.col.push(top.r, top.g, top.b, top.r, top.g, top.b, bot.r, bot.g, bot.b, bot.r, bot.g, bot.b);
      sk.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    };
    const P = (i, j) => [x0 + (i + 0.5) * cell, hy(i, j), z0 + (j + 0.5) * cell];
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        if (!quad(i, j)) continue;
        const a = vert(i, j), b = vert(i + 1, j), c = vert(i + 1, j + 1), d = vert(i, j + 1);
        idx.push(a, d, b, b, d, c);
        if (!quad(i, j - 1)) skirt(P(i, j), P(i + 1, j));
        if (!quad(i, j + 1)) skirt(P(i, j + 1), P(i + 1, j + 1));
        if (!quad(i - 1, j)) skirt(P(i, j), P(i, j + 1));
        if (!quad(i + 1, j)) skirt(P(i + 1, j), P(i + 1, j + 1));
      }
    }
    const g = new THREE.Group();
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    tg.setIndex(idx);
    g.add(new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ map: T[s.t], toneMapped: false, side: THREE.DoubleSide })));
    if (sk.idx.length) {
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(sk.pos, 3));
      sg.setAttribute('color', new THREE.Float32BufferAttribute(sk.col, 3));
      sg.setIndex(sk.idx);
      g.add(new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide })));
    }
    return g;
  }

  // oggetti piccoli (sopra console e credenza): voxel colorati da 6 mm con le sole facce visibili, una mesh sola
  function buildVox(list, plain, base, man) {
    const pos = [], col = [], idx = [];
    const FACES = [ // normale, quattro angoli, luminosita' della faccia
      [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], 0.82], [[-1, 0, 0], [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], 0.74],
      [[0, 1, 0], [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], 1.0], [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], 0.55],
      [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], 0.9], [[0, 0, -1], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], 0.7],
    ];
    for (const v of list) {
      const im = man.images[v.bin], dv = new DataView(plain, base + im.o, im.n);
      const n = v.n, K = (x, y, z) => (x * 1024 + y) * 1024 + z, set = new Set();
      for (let i = 0; i < n; i++) set.add(K(dv.getUint16(i * 9, true), dv.getUint16(i * 9 + 2, true), dv.getUint16(i * 9 + 4, true)));
      const c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const ix = dv.getUint16(i * 9, true), iy = dv.getUint16(i * 9 + 2, true), iz = dv.getUint16(i * 9 + 4, true);
        c.setRGB(dv.getUint8(i * 9 + 6) / 255, dv.getUint8(i * 9 + 7) / 255, dv.getUint8(i * 9 + 8) / 255, THREE.SRGBColorSpace);
        for (const [nrm, cs, sh] of FACES) {
          if (set.has(K(ix + nrm[0], iy + nrm[1], iz + nrm[2]))) continue;
          const i0 = pos.length / 3;
          for (const q of cs) {
            pos.push(v.x0 + (ix + q[0]) * v.cell, v.y0 + (iy + q[1]) * v.cell, v.z0 + (iz + q[2]) * v.cell);
            col.push(Math.min(1, c.r * sh), Math.min(1, c.g * sh), Math.min(1, c.b * sh));
          }
          idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide }));
  }

  async function build(plain, onStatus) {
    const dv = new DataView(plain);
    const mlen = dv.getUint32(0, true);
    const man = JSON.parse(new TextDecoder().decode(new Uint8Array(plain, 4, mlen)));
    const base = 4 + mlen;
    const T = {};
    const stage = new THREE.Group(), walls = [];
    const names = Object.keys(man.images);
    let k = 0;
    for (const name of names) {
      const im = man.images[name];
      if (!/^image\//.test(im.t)) continue; // dati binari (quote del divano): si leggono a parte
      onStatus?.(`Preparo le foto… ${++k}/${names.length}`);
      T[name] = await tex(new Blob([new Uint8Array(plain, base + im.o, im.n)], { type: im.t }));
    }
    const basic = (map, o = {}) => new THREE.MeshBasicMaterial({ map, toneMapped: false, ...o });
    // pareti: un piano per parete, nel riferimento della parete (u lungo, y in alto, z verso l'interno); con i passaggi (l'arco) il piano ha il buco e dietro c'e' la profondita'
    const extras = [];
    for (const id of Object.keys(WALLS)) {
      if (!man.walls[id]) continue;
      const w = WALLS[id];
      const ops = (OPENINGS[id] || []).filter((o) => o.kind === 'passage')
        .map((o) => ({ ...o, u0: Math.min(w.toU(o.s0), w.toU(o.s1)), u1: Math.max(w.toU(o.s0), w.toU(o.s1)) })).sort((a, b) => a.u0 - b.u0);
      const holes = ((man.holes || {})[id] || []).map(([u0, u1, y0, y1]) => ({ u0, u1, y0, y1 })); // finestre: buco nel muro, il telaio e le spalle stanno nel pacchetto (prim con `wall`)
      let m;
      if (ops.length || holes.length) {
        m = new THREE.Mesh(wallWithHoles(w, [...ops, ...holes].sort((a, b) => a.u0 - b.u0)), basic(T[man.walls[id]], { side: THREE.DoubleSide }));
        for (const o of ops) { const a = archParts(w, o, T[man.walls[id]], !!man.corridor); a.wall = id; a.deep.forEach((e) => { e.visible = false; }); a.flat.visible = false; extras.push(a); }
      } else {
        m = new THREE.Mesh(new THREE.PlaneGeometry(w.len, ROOM.H), basic(T[man.walls[id]]));
        m.position.set(w.len / 2, ROOM.H / 2, 0);
      }
      m.userData.wall = id;
      m.visible = false;
      walls.push(m);
    }
    // pavimento (l'immagine ha in alto la parete TV) e soffitto
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.L, ROOM.W), basic(T[man.floor]));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(ROOM.L / 2, 0, ROOM.W / 2);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.L, ROOM.W), basic(ceilingTexture()));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(ROOM.L / 2, ROOM.H, ROOM.W / 2);
    stage.add(floor, ceil);
    // mobili: tutte le facce con foto in una sola mesh (atlante), le altre a tinta unita in un'altra
    const [aw, ah] = man.atlasSize;
    const P = { t: { pos: [], uv: [], idx: [] }, f: { pos: [], col: [], idx: [] } };
    const col = new THREE.Color();
    const solid = [];
    for (const b of man.boxes) {
      const a = b.min, c = b.max;
      if (b.solid !== false) solid.push({ min: a, max: c, grp: b.grp || '' });
      if (b.hidden) continue; // solo ostacolo: la forma vera e' un'altra mesh (il divano)
      if (b.round) { stage.add(Object.keys(b.faces || {}).length ? roundedTexMesh(b, T[man.atlas], aw, ah) : roundedMesh(b)); continue; }
      col.set(b.color);
      const faces = [...new Set([...Object.keys(b.faces || {}), ...(b.flat || [])])];
      for (const f of faces) {
        const d = FACE[f](a, c);
        const corner = (i, j) => [d.o[0] + d.r[0] * d.w * i + d.u[0] * d.h * j, d.o[1] + d.r[1] * d.w * i + d.u[1] * d.h * j, d.o[2] + d.r[2] * d.w * i + d.u[2] * d.h * j];
        const q = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)];
        const baked = b.faces && b.faces[f];
        const S = baked ? P.t : P.f;
        const i0 = S.pos.length / 3;
        q.forEach((p) => S.pos.push(...p));
        if (baked) {
          const [x0, y0, x1, y1] = baked;
          const u0 = (x0 + 0.5) / aw, u1 = (x1 - 0.5) / aw, v0 = 1 - (y1 - 0.5) / ah, v1 = 1 - (y0 + 0.5) / ah; // v=0 in basso (texture capovolta)
          S.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
        } else {
          const s = d.sh;
          for (let i = 0; i < 4; i++) S.col.push(Math.min(1, col.r * s), Math.min(1, col.g * s), Math.min(1, col.b * s));
        }
        S.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
      }
    }
    const geo = (S, withUv) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(S.pos, 3));
      if (withUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(S.uv, 2)); else g.setAttribute('color', new THREE.Float32BufferAttribute(S.col, 3));
      g.setIndex(S.idx);
      return g;
    };
    if (P.t.idx.length) stage.add(new THREE.Mesh(geo(P.t, true), basic(T[man.atlas])));
    if (P.f.idx.length) stage.add(new THREE.Mesh(geo(P.f, false), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
    buildCeilingStuff(stage);
    if (man.sofa) stage.add(buildSofa(man, plain, base, T));
    if (man.vox && man.vox.length) stage.add(buildVox(man.vox, plain, base, man));
    for (const it of man.items || []) stage.add(softItem(it));
    const blob = (name) => { const im = man.images[name]; return plain.slice(base + im.o, base + im.o + im.n); };
    const deepPrims = [], wallPrims = [];
    for (const p of man.prims || []) { const m = primMesh(p, T, blob); if (p.deep) { deepPrims.push(m); } else if (p.wall) wallPrims.push([p.wall, m]); else stage.add(m); } // piccoli oggetti: lampada, vasi, portabottiglie, mensole con pianta e fumetti; i 'deep' (corridoio) seguono l'arco; i 'wall' (le porte) restano attaccati alla loro parete
    for (const id of Object.keys(man.art || {})) arts[id] = T[man.art[id]];
    group.add(stage);
    for (const m of walls) { groups[m.userData.wall].add(m); pieces.push(m); wallMeshes.push(m); }
    for (const a of extras) { a.deep.forEach((e) => groups[a.wall].add(e)); groups[a.wall].add(a.flat); archSets.push(a); }
    for (const [wid, m] of wallPrims) { // le coordinate del pacchetto sono quelle della stanza: il contenitore annulla la matrice della parete, e sparisce insieme a lei da fuori
      const h = new THREE.Group(); h.applyMatrix4(groups[wid].matrix.clone().invert()); h.add(m); h.visible = false;
      groups[wid].add(h); wallObjs.push(h);
    }
    for (const m of deepPrims) corrGroup.add(m);
    pack = { solid, spawn: man.spawn || { pos: [1.6, 1.6, 3.9], yaw: 0 }, floorTex: T[man.floor], corridor: man.corridor && man.corridor.x1 ? man.corridor : null };
  }

  const api = {
    get ready() { return !!pack; },
    get on() { return on; },
    get colliders() { return pack ? pack.solid : []; },
    get spawn() { return pack?.spawn; },
    get corridor() { return pack?.corridor || null; }, // {x0, x1, zn, zf, h, arch: [x0, x1, h]}: il disimpegno dietro l'arco e il suo passaggio
    art: (id) => arts[id] || null,
    // 'ok' | 'nokey' | 'badkey' | 'assente' | 'rete' | 'pacchetto' | 'errore'
    load(onStatus) {
      if (pack) return Promise.resolve('ok');
      if (loading) return loading;
      loading = (async () => {
        const key = readKey();
        if (!key) return 'nokey';
        try {
          const raw = await fetchPack(onStatus);
          onStatus?.('Apro la stanza…');
          const plain = await decryptPack(raw, key);
          await build(plain, onStatus);
          return 'ok';
        } catch (e) {
          const m = String(e && e.message);
          return ['chiave', 'assente', 'rete', 'pacchetto'].includes(m) ? (m === 'chiave' ? 'badkey' : m) : 'errore';
        }
      })().then((r) => { loading = null; return r; });
      return loading;
    },
    // da chiamare a ogni frame: dentro la stanza l'arco ha la profondita', da fuori resta la foto piatta; ritorna true se qualcosa e' cambiato
    update(cam) {
      if (!pack) return false;
      const p = cam.position, c = pack.corridor;
      const room = p.x > 0.02 && p.x < ROOM.L - 0.02 && p.z > 0.02 && p.z < ROOM.W - 0.02 && p.y < ROOM.H;
      const corr = !!c && p.x > c.x0 && p.x < c.x1 && p.z <= 0.02 && p.z > c.zf && p.y < c.h; // dentro il passaggio o il disimpegno
      const inside = room || corr;
      if (inside === archDeep) return false;
      archDeep = inside; applyArch();
      return on;
    },
    setLook(v) {
      on = !!v && !!pack;
      blockTop.forEach((o) => { o.visible = !on; });
      blockWall.forEach((o) => { o.visible = !on; });
      wallMeshes.forEach((o) => { o.visible = on; });
      wallObjs.forEach((o) => { o.visible = on; });
      applyArch();
      group.visible = on;
      render();
      return on;
    },
  };
  return api;
}
