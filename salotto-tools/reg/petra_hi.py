"""Quadro di Petra ad alta qualita': una sola foto (939e9457, ripresa da vicino: nitida e coi colori veri) invece della media di tutte (sfocata e sbiadita).
La posa di quella foto ha ~9 cm di errore su questa parete: si cuoce una regione piu' grande a 1800 ppm, si trova il rettangolo del quadro (colore contro intonaco) e lo si raddrizza
con i suoi quattro angoli sul rettangolo vero 0,50 x 0,75 m. La foto e' di scorcio: il quadrilatero include a sinistra l'ombra sul muro e il fianco chiaro del pannello (23 colonne) e in basso l'ombra (10 righe), che si tolgono;
il tono si porta dove stanno le foto frontali (la foto da vicino e' piu' scura e contrastata rispetto al muro: rapporto quadro/muro 0,62/0,53/0,50 contro 0,71/0,63/0,61; roccia in alto +7/12/19%, sabbia a posto) con gamma 0,88 e un guadagno per canale. Uso: python3 petra_hi.py [FOTO]  ->  out/art_petra_hi.png (894 x 1344), da copiare su out/art_petra.png prima di build_pack.py"""
import sys, json
sys.path.insert(0, '/tmp/claude-0/s/reg')
from bake4 import *
from paintings import PAINT, region
CAM = sys.argv[1] if len(sys.argv) > 1 else '939e9457'
PPM = 1800
P0 = json.load(open('/tmp/claude-0/s/reg/out/paintings_final.json'))['petra']
fr = FR(); p = dict(PAINT['petra']); hw, hh = p['w'] / 2 + 0.16, p['h'] / 2 + 0.16
P, N, shape = region(fr, p['wall'], P0['u'], P0['y'], hw, hh, PPM, 0.03)
img, valid, tot = bake(fr, P, N, shape, [CAM], None, scale=1.0, power=4.0, smooth=0, gain=False, tag='t', verbose=False, cos_pow=2.0, min_cos=0.2)
cv2.imwrite('/tmp/claude-0/s/reg/out/petra_hi_region.png', img); print('regione', img.shape, 'valida', round(float(valid.mean()), 3))
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV); S, V = hsv[..., 1].astype(np.float32), hsv[..., 2].astype(np.float32)
mask = ((S > 38) | (V < 150)).astype(np.uint8) * 255; mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8)); mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(mask, connectivity=8); k = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA]); m = (lab == k).astype(np.uint8) * 255
c = max(cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0], key=cv2.contourArea); peri = cv2.arcLength(c, True)
for eps in np.linspace(0.005, 0.06, 23):
    a = cv2.approxPolyDP(c, eps * peri, True)
    if len(a) == 4: break
q = a[:, 0, :].astype(np.float32); s = q.sum(1); d = q[:, 0] - q[:, 1]; q = np.array([q[np.argmin(s)], q[np.argmax(d)], q[np.argmax(s)], q[np.argmin(d)]], np.float32)
print('angoli del quadro (px):', q.round(0).tolist(), 'lati', [round(float(np.linalg.norm(q[(i + 1) % 4] - q[i])), 0) for i in range(4)])
w, h = int(round(p['w'] * PPM)), int(round(p['h'] * PPM)); inset = 3
Hm = cv2.getPerspectiveTransform(q, np.array([[0, 0], [w, 0], [w, h], [0, h]], np.float32))
art = cv2.warpPerspective(img, Hm, (w, h), flags=cv2.INTER_CUBIC)
# bordi: la foto e' ripresa di lato e di scorcio, il quadrilatero include a sinistra l'ombra sul muro e il fianco chiaro del pannello (colonne 0-22), in basso l'ombra (righe 0-9 dal basso): si tolgono
# (misurati sui profili di saturazione e luminosita': il quadro vero comincia alla colonna 23) e si riporta alla stessa dimensione (variazione di scala < 3%)
L, R_, T_, B_ = 23, 1, 1, 10
art = cv2.resize(art[T_:h - B_, L:w - R_], (w - 2 * inset, h - 2 * inset), interpolation=cv2.INTER_CUBIC)
# tono: la foto da vicino e' piu' scura e contrastata delle altre (frontali, da lontano) rispetto al muro: rapporto quadro/muro 0,62/0,53/0,50 contro 0,71/0,63/0,61 nelle foto frontali
# (zona centrale; roccia in alto +7/12/19%, sabbia gia' a posto); curva leggera (gamma 0,88 e un guadagno per canale) che porta il quadro dove stanno le altre foto, che sono il riferimento anche per il Taj
x = (art.astype(np.float32) / 255.0) ** 0.88 * 255.0 * np.array([1.02, 0.98, 0.96], np.float32)[None, None, :]       # BGR: R 0,96, G 0,98, B 1,02 (minimi quadrati sugli scarti di roccia, centro e sabbia)
art = np.clip(x, 0, 255).astype(np.uint8)
cv2.imwrite('/tmp/claude-0/s/reg/out/art_petra_hi.png', art); print('quadro', art.shape)
