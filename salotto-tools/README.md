# Strumenti della stanza a foto (Salotto 3D)

Qui c'è come è stato costruito `salotto/pack/salotto.bin`, il pacchetto della modalità **Foto** e della **camminata**.
Le foto e le scansioni 3D di casa **non** sono nel repo (il repo è pubblico): servono solo a chi rigenera il pacchetto. Nel repo c'è solo il pacchetto **cifrato**.

## Come funziona
1. `sfm/run_sfm_hi.py` — registra le foto (pycolmap, solo CPU): posizione e inclinazione di ogni scatto.
   `sfm/reg_new.py` aggiunge foto nuove al modello già fatto senza muovere quelle vecchie (camera e pose fisse).
2. `reg/calib.py`, `calib2.py`, `frame.py` — allineano il modello alla stanza (parete TV, parete split, pavimento) e ne fissano le misure.
   La parete split sta 30 cm più in dentro del primo piano trovato: `frame.py` ha `XSHIFT = 0.30` e la stanza è lunga **7,10 m** (non 7,4).
3. `reg/scene_def.py` — i mobili come scatole (misure da foto, sovrapposizioni e triangolazioni), le primitive (lampada, vaso a tornio, portabottiglie) e quali facce prendono la foto.
   Le misure scritte nel vecchio sistema si spostano da sole (`DX`).
   Il **tavolino rosso a C** e' lamiera da 4 mm (`c_dorso`, `c_piano`): il montante sta a terra fuori dal bracciolo, il piano si appoggia sopra il bracciolo (4 mm sopra) e il ramo basso
   sta sotto il divano (non si vede, non e' modellato): non aggiunge volume al divano. Il bracciolo e' una scatola smussata con le foto sul fronte (`s_bracciolo`), non parte del campo di quote.
   Attenzione: le foto registrate dopo (`sfm/reg_new.py`) hanno pose meno precise delle prime: per misurare si controlla sempre con due viste.
4. Bake delle texture, ciascuna da più foto con occlusione (`reg/cams_sel.py` esclude le foto scattate dal corridoio). **Lanciarli con `FRAME_EXT=1`**: senza, usano solo le prime foto e non le 12 nuove:
   - `reg/run_walls7.py 400 TAG 0.5 T W F A` — le 4 pareti (400 px/m)
   - `reg/run_walls9.py 400 TAG 0.5 F` — la parete d'ingresso (F) con anche le foto scattate dal corridoio, dietro l'arco: guardano la stanza di fronte alla parete con un'esposizione coerente (nel bake generale
     usciva beige e con la striscia a destra della porta scura e bluastra). Un punto del muro usa una foto del corridoio solo se il raggio passa davvero dentro l'arco (`run_walls8.py`: due piani da attraversare dentro
     l'apertura); il resto e' occluso. In parallelo (4 processi) e con l'occlusione solo dove la foto vede il muro: 2 minuti invece di 40. `EXCLUDE=71b0eb9f` scarta la foto buia dal fondo del corridoio (guadagno 3,9:
     il muro veniva fuori bruciato). `build_pack.WALL_TAG` dice quale bake usare per quella parete.
   - `reg/run_floor7.py 350 TAG 0.5` — il pavimento
   - `reg/bake_furniture7.py 0.5 TAG` — le facce dei mobili
   - `reg/paintings.py` — misura i 5 quadri e ne estrae la foto
   - `reg/petra_hi.py` — il quadro di Petra da una sola foto nitida (939e9457) invece della media sfocata: cuoce una regione piu' grande a 1800 ppm, trova il rettangolo del quadro per colore e lo raddrizza sul vero 0,50 x 0,75 m (la posa di quella foto sbaglia di ~9 cm su questa parete); poi toglie dal quadrilatero l'ombra e il fianco chiaro del pannello visti di scorcio (23 colonne a sinistra, 10 righe in basso) e porta il tono dove stanno le foto frontali (la foto da vicino era 12-19% piu' scura del muro rispetto a loro: gamma 0,88 e un guadagno per canale, scarti residui entro 7%, il riferimento e' lo stesso dei quadri come il Taj); il risultato (`out/art_petra_hi.png`) si copia su `out/art_petra.png` prima di `build_pack.py`
5. Le scansioni 3D (`.spz`, Scaniverse) danno la forma di ciò che le foto non rendono bene:
   - `scan/spzload.py` legge il file; `scan/photo_align*.py` lo allinea alla stanza massimizzando la correlazione con le foto
   - divano: `scan/sofa_hf.py` → `sofa_hf2.py` → `sofa_hf3.py` ricavano un campo di quote a 2 cm (senza i cuscini, che hanno `cushions.py` / `cushions2.py`);
     `reg/sofa_bake.py` ne ricava la texture a 5 mm dalle foto (occlusione del campo stesso), `reg/sofa_export.py` riempie i buchi e prepara quote e texture
     `scan/sofa_cut.py` toglie dal campo di quote il bracciolo e il piano del tavolino con le rotelle che la scansione aveva incluso (parte sempre dall'originale)
     `reg/sofa_clean.py DIR_IN DIR_OUT` ripulisce divano (quote + texture) senza nuove foto: le quote con riduzione del rumore a variazione totale (spiana le pieghe di qualche cm e tiene i gradini veri: bracciolo,
     schienale, bordo della chaise), la texture ricostruendo per diffusione le macchie rosse e bianche (il tavolino e i cuscini proiettati sul divano) e portando la crominanza a un grigio neutro; `SOFA_DIR=DIR_OUT` per `build_pack.py`
   - oggetti sulla console (versione vecchia, ora non piu' nel pacchetto): `scan/cons_vox.py` li trasforma in voxel da 6 mm; `reg/vox_photo.py` li ricolora con le foto
   - oggetti sulla console in 3D vero (`reg/console_obj.py`): le figure Funko (Art, Pennywise, Mandalorian, Daredevil) sono rilievi fotografici: da una foto frontale si ricava la maschera della sagoma
     (`console/seglib.py` e gli script `console/seg_*.py`, GrabCut con semi a mano; `console/prep_console.py` salva ritagli e maschere in `CONSOLE_ASSETS`, fuori dal repository perche' sono foto di casa), la
     profondita' di ogni punto viene dalla distanza dal bordo (profilo tondeggiante), il colore e' la foto stessa con la maschera alfa (`alphaMap`). La custodia del fumetto ha il frontale rettificato
     dalla foto (omografia sui quattro angoli), pannelli acrilici trasparenti (`alpha`), spigoli chiari e base nera; lampada plissettata, telecamera bianca, ciotola nera con i cioccolatini, basi, pozza di sangue di
     Pennywise e il piano di legno (texture sintetica con le ombre di contatto) sono mesh a colori per vertice o con texture sintetiche. Con `CONSOLE_ASSETS` impostata `build_pack.py` le aggiunge al
     pacchetto (blocchi `cm_*`, texture `cobj_*`) e toglie voxel e vecchia lampada.
   - vaso rosso nel vano del mobile TV: la scansione (splat + mesh) conferma un cilindro semplice; le misure (raggio 5,3 cm, alto 21,5 cm, in piedi a x 6,68 e z 0,30) vengono
     dal contorno nella foto registrata (`reg/vase_profile.py`: diametro a ogni quota, nel piano dell'asse), perche' la scala delle scansioni non e' affidabile; `reg/vase_tex.py` ricava
     la texture intorno al cilindro (colonne = angolo, righe = quota). Il vano e' vero (fondo e divisorio in `scene_def.py`), il vaso e' una `cylt` nel pacchetto.
   - mobile a mensole accanto alla TV (il 'mobile quadrato'): la struttura e' misurata da foto registrate (triangolazioni `tri.py`/`vline.py`/`rayplane.py` e sovrapposizioni): fondo beige sottile (3,4 cm) a x 3,54-3,855,
     pilastro da 3,855 a 4,25 con il pannello grafite davanti (x 3,80-4,415, z 0,24-0,26; in realta' e' inclinato di ~4,6 gradi), quattro mensole in noce trapezoidali (il lato sinistro e' in diagonale; spessore 2,2 cm).
     Mensole, pianta (tradescantia), brocca, vasetti, fumetti e vasi rossi sono una mesh a colori per vertice (`meshlib.py` + `shelf_unit.py`, tipo `vmesh` nel pacchetto); il fondo e il fianco del pilastro
     sono texture sintetiche con le ombre portate di una luce dall'alto a sinistra (`shelf_tex.py`, direzione ricavata dalle ombre nelle foto): le foto dell'interno sbavavano.
   - mensole portaquadri nere e i sei quadretti (`reg/ledges.py`): le posizioni (u lungo la parete TV, altezza del piano) vengono dalla parete cotta e dal confronto con una foto registrata frontale; i quadretti sono
     rettificati dalla foto (`console/prep_posters.py`: angoli del passepartout trovati in automatico dalla cornice nera, due a mano; atlante 3x2), inclinati di 8 gradi all'indietro contro il muro.
     In `build_pack.py` le fasce della parete TV dove c'erano le vecchie foto dei quadretti vengono ricostruite per diffusione (`WALL_EXCL`).
   - oggetti sulla credenza (`reg/credenza_obj.py`): il vaso smaltato e' un solido di rotazione col profilo letto dalle silhouette nelle foto registrate (la scala e' verificata sulle silhouette in quattro foto,
     raggio x 0,93), l'asse (x 0,155, z 1,945) viene da due foto e dal confronto delle silhouette; la texture e' cotta dalle foto con `reg/phototex.py` (si proietta ogni punto con la posa della foto, peso = coseno
     dell'angolo di vista, maschere GrabCut `console/seg_vase.py` per scartare lo sfondo, riflessi puntiformi scartati, buchi riempiti per diffusione). Il portabottiglie nero ha telaio (cx 0,158, cz 0,557, ruotato di
     27,6 gradi, 21,5 x 19,3 x 30,5 cm) e sei bottiglie adattati ai punti letti a mano in tre foto registrate (`console/rackfit.py`, `console/bottlefit.py`, controllo con `console/rackov.py`); le etichette delle tre
     bottiglie davanti sono ritagli rettificati dalla foto frontale, incollati come strisce curve; capsule e anelli del collo a colori per vertice. La ciotola di rame (a x 0,33 z 1,31, da tre raggi) ha un oggetto
     blu-argento dentro. Attenzione: la foto registrata 8ebbe415 ha una posa sbagliata di 10-20 cm in questa zona (il vaso torna perche' e' stato triangolato anche con lei): per misurare sulla credenza si usano
     3039c671, 6d89137e e 4bd3d963 (`console/vaseov.py` e `console/pairs.py` sovrappongono modello e foto).
   - interruttore e presa sulla parete A (`reg/wall_obj.py`): placche a tre moduli (11,7 x 8,2 cm) con gli angoli intersecati col piano della parete in due foto (concordano entro 4 mm). Nella texture della
     parete A le loro fasce sono ricostruite (`WALL_EXCL['A']`): le foto, con pose un po' diverse, le avevano cotte doppie.
   - applique, citofono e placca sulla parete d'ingresso F (`reg/wall_obj.py`): due applique nere (asta da 1 cm e cilindro da 5,6 cm contro il muro, l'asta davanti al cilindro), pannello e cornetta bianchi del citofono
     (cavo a spirale), placca nera a quattro tasti. Posizioni dai raggi di tre foto registrate (79eb58fc, 6eac1b0f, 8a00d20d) intersecati col piano della parete (z = 4,5: il quadro dell'Islanda torna a 1 cm),
     dimensioni dalle stesse foto. Le fasce della parete F con le loro vecchie immagini doppie (e l'alone caldo delle applique accese) sono ricostruite per diffusione (`WALL_EXCL['F']`).
   - corridoio dietro l'arco (`reg/corridor_obj.py`): un disimpegno di 2,8 x 1,4 m con le tre porte di mogano chiuse (la seconda, nelle foto aperta, usa la stessa foglia riflessa; la terza sta sul muro sinistro, vedi sotto), le due stampe manga in bianco e nero e il pavimento di marmo.
     Le foto del corridoio dell'utente (verticali, non registrate nel modello) si mettono nel riferimento della stanza con una PnP (`console/corr_pose.py`): angoli dell'arco e tre punti della parete TV letti in una foto
     registrata (b4bfa2ec). Il muro di fondo sta a z = -1,40: il pavimento letto in due foto indipendenti (la PnP e la registrata) lo da' a -1,40 e stampe da 48 x 68 cm; il confronto fotometrico fra foto
     registrate dava -2,15 ma dipende troppo dalle pose relative. L'imbotte dell'arco e' profondo 40 cm (lo dice il bordo posteriore dell'architrave nella foto), non 25.
     `console/corr_prep.py` ricava le texture: stampe rettificate con l'omografia dei quattro angoli (`console/corners_view.py` e `gcrop2.py` per leggerli a mano), foglia della porta, pavimento e colori dell'imbotte
     campionati con la posa; il pavimento che l'arco non lascia vedere si completa a specchio. L'intonaco e' a colori per vertice col gradiente di luce visto nella foto (luce calda dall'alto).
     Nel pacchetto sono prim `vmesh` con `deep: 1`: `real.js` li mostra solo da dentro la stanza, insieme all'imbotte (con `corridor` nel manifesto i piani procedurali di stipiti, architrave e tunnel non si usano piu').
     I ritagli (foglia, stampe, pavimento, imbotte) stanno in `CONSOLE_ASSETS/corr` (foto di casa, fuori dal repository). La fascia sinistra della parete TV (x 0-0,47, a sinistra dell'arco) e' ricostruita per diffusione (`WALL_EXCL`): le foto la cuocevano a chiazze.
     Il disimpegno e' percorribile: `corridor_obj.ZONE` (x 0,02-2,80, z da -0,40 a -1,40, altezza 2,70, apertura dell'arco) va nel manifesto (`corridor`); `real.js` tiene le parti `deep` in un gruppo a parte
     (`corrGroup`, visibile da dentro la stanza e da dentro il disimpegno: il gruppo del muro TV sparisce guardando da dietro) e `walk.js` somma il passaggio dell'arco e il disimpegno alla zona percorribile.
     Il retro della parete TV (z = -0,40, con il buco dell'arco) e il suo zoccolo stanno in `corr_walls` e `corr_trim`.
     Le maniglie sono in 3D (`corr_handles`: `_lever`, `_pull`): leva d'ottone con rosetta e bocchetta della serratura (centro a 0,93 m, a 10,5 cm dal bordo dove sta la serratura: dalla foto frontale) sulla porta di sinistra
     del fondo e su quella del muro sinistro (specchiata: serratura verso l'angolo), maniglia incassata a barra verticale sull'anta di destra (a sinistra, come nelle foto). La vecchia texture della foglia aveva
     una sbavatura d'ottone (la leva vista di taglio) a ~1,02 m: si cancella con `cv2.inpaint` prima di salvare la texture.
     La terza porta, sul muro sinistro (x = 0,02), e' `corridor_obj.LDOOR`: cornice a due gradini in `corr_trim` e foglia `corr_leaf3` (stessa texture della porta di fondo, riflessa: maniglia verso l'angolo).
     Si vede solo nella foto presa da destra attraverso l'arco: `console/corr_pose_side.py` ricava la posa (PnP sui punti vicini dell'imbotte e della targa, ancorata al campo lontano con lo spigolo
     muro sinistro / fondo a z = -1,40) e da li' il bordo esterno della cornice verso l'angolo (z = -1,25) e la sua quota (1,92); il lato verso l'arco sta dietro lo stipite, quindi la larghezza della foglia e' quella di fondo (0,568 m).
     Nella stessa foto si vedono, sul muro di fondo a sinistra della porta di fondo, un interruttore e un router attaccato alla presa (non ancora nel modello) e la porta di fondo comincia piu' a destra di dove la mette
     il modello (bordo esterno della cornice a x >= 0,37 invece di 0,32): da rimisurare con la foto frontale.
   - le due porte (`reg/door_obj.py`): la porta interna chiusa sulla parete A e il portone blindato d'ingresso sulla parete F, in rilievo davanti al muro (prima erano dipinte nella texture della parete, con doppie
     immagini e angoli sbavati). Le foto frontali dell'utente (non registrate: 81d8e52c e afd7ab79) si tolgono dalla distorsione radiale e si raddrizzano con l'omografia dei quattro angoli esterni del coprifilo
     (`console/door_prep.py`, 600 px/m; angoli letti a mano con `console/gcrop2.py`, `gbright.py` schiarisce le zone in ombra). Le misure del coprifilo (A: 0,886 x 2,035 m, bordo sinistro a z = 3,439; F: 1,236 x 2,24 m,
     bordo sinistro a x = 1,624) vengono dagli angoli letti in foto registrate (A: 6d89137e; F: 6eac1b0f e 79eb58fc, che concordano a 2 mm) e riportati sul piano della parete. La stessa immagine copre coprifilo e
     foglia: quattro quadri (due montanti, traverso, foglia rientrata di 2-4 mm) piu' i bordi a tinta unita; ferramenta in 3D con le posizioni lette sulla texture rettificata (leva e rosetta, bocchetta; placca,
     pomolo, leva, cilindro e spioncino). Le texture si riportano alla luce dei muri (guadagno per canale = intonaco cotto nel pacchetto / intonaco della foto frontale). Nella texture dei muri A e F la fascia della
     porta e' ricostruita per diffusione (`WALL_EXCL`, da 10 cm da terra: lo zoccolo di marmo resta) e il pavimento lungo la parete d'ingresso (z > 4,20) si rifa con marmo specchiato (`build_pack.floor`):
     l'anta scura vi si proiettava (macchia scura) con una zona beige accanto. Nel pacchetto sono prim `vmesh` con `wall`: `real.js` li lega al gruppo della parete, che sparisce quando la si guarda da fuori.
   - la finestra della parete W (`reg/win_obj.py`): buco nel muro (z 0,726-1,630, y 0,95-2,49: alta 154 cm e a 95 cm da terra, misure dell'utente; larga 0,904 dalle foto registrate) e un unico piano di telaio e vetri 1,5 cm dietro il filo, con quattro spalle d'ottone di 1,5 cm. La texture (`console/win_prep2.py`) e' la foto vera della finestra: il quadrilatero esterno dell'oro si segmenta per colore (`console/measure_gold.py`) e si raddrizza sul rettangolo 0,904 x 1,54 con l'omografia dei quattro angoli, cosi' proporzioni e bordi d'oro (~9% della larghezza: modello 8,7-10% contro 8,8-10,2% della foto) sono quelli veri; i vetri della foto sono scuri e pieni di riflessi della stanza e si sostituiscono con quelli puliti della vecchia texture (`frame_clean.png`), rimappati con l'omografia fra le due coppie di vetri. Storia: telaio 12 cm dietro il muro con spalle d'ottone (dai fianchi la banda vicina spariva), spalle d'intonaco (sembrava incassata), telaio a filo (idem), anello d'ottone 1,25 / 3,75 / 4,5 cm attorno al vecchio riquadro del telaio (piu' alto del vero, bordo troppo sottile): per questo ora la texture parte dalla foto e non dal riquadro. Prima il telaio era cotto nella texture del muro e veniva sfocato e sdoppiato:
     sta dietro il filo del muro e le foto registrate lo vedono da 5-7 m con pose diverse (`console/win_sweep.py` cerca la profondita' in cui le foto concordano di piu': 12-13 cm). Ora il telaio e' un piano a parte
     con la foto frontale dell'utente (non registrata, 25d46ef1) rimappata a 800 px/m (`console/win_prep.py`).
     Come si raddrizza (la prima versione usava un riferimento cotto da una foto registrata e un ECC: usciva leggermente storta e asimmetrica): otto angoli dei vetri letti a mano nella foto ingrandita
     (`console/gcrop2.py`), omografia foto -> riquadro ideale con due vetri uguali e simmetrici e bordi alto/basso allineati; si cercano insieme l'omografia e il riquadro (distanza fra i vetri; l'altezza, in
     larghezze di vetro, non si ricava dai soli angoli: la si trova imponendo che le colonne della rotazione siano ortonormali con la K della camera). Residuo di 1 px sugli otto angoli, h = 4,359, camera a
     2,35 m dal telaio. Il rendering dell'app dalla posa della foto (camera della decomposizione, f = 3024,6) si sovrappone alla foto senza doppie immagini: telaio, apertura e spalle sono nel posto giusto.
     Misure: scala 0,329 m per larghezza di vetro; asse centrale a z = 1,178, bordo basso dei vetri a y = 0,995. Apertura nel muro (angoli esterni delle spalle letti a mano, riportati sul piano del muro con la camera): z 0,726-1,630, y 0,925-2,466; contorno del telaio (faccia esterna, simmetrico): z 0,7635-1,5925, y 0,9786-2,4644. Le quattro spalle sono facce piane svasate fra i due rettangoli,
     tinta unita d'intonaco (mediana del muro attorno al buco, scurita verso il telaio): prima erano ottone raddrizzato dalla foto e da un fianco la banda lontana, grossa e dorata, contro la vicina,
     sottile e senza riflessi, faceva sembrare il contorno asimmetrico; nelle foto la finestra sta in uno sguardo d'intonaco bianco. Il riflesso del fotografo e del vaso nei vetri si copre con la griglia a persiane copiata da 9 stecche sopra; nelle spalle i riflessi dell'ottone
     (bianco pieno nella foto) si sostituiscono con il colore della striscia (`deglare`), e oltre il bordo vero l'ultimo colore d'ottone si prolunga (`strip_plaster`: intonaco = poco saturo e non bruciato).
     Nel manifesto `holes` dice a `real.js` di ritagliare la parete (`wallWithHoles` ora tiene anche il pezzo sotto l'apertura) e i prim con `wall: 'W'` restano legati alla parete. Nella texture del muro W
     la fascia della finestra e il telaio sdoppiato (arriva a z = 1,72) sono ricostruiti per diffusione (`WALL_EXCL['W']`, morbido). La nicchia e il radiatore restano cotti nel muro.
6. `reg/build_pack.py TAG_MURI TAG_PAV TAG_FACCE salotto.bin` — toglie i quadri dai muri, riempie i buchi, mette l'ombra sotto i mobili sospesi,
   impacchetta atlante, divano, voxel e primitive e cifra tutto con AES-256-GCM. Nella parete W il muro dietro il divano (z 1,85-4,50, sotto 0,88 m: nessuna foto lo vede)
   si ricostruisce con il riempimento morbido (`WALL_EXCL['W']`): quello "solo intonaco chiaro" lasciava un blocco piu' chiaro con il bordo netto. Nella parete F la fascia delle applique arriva fino al portone
   (prima a destra restava un blocco d'alone caldo con il bordo netto).

I percorsi di lavoro sono scritti nei file (cercare `/tmp/claude-0/s`): vanno adattati. Le scansioni si passano con la variabile `SPZ_FILE`.

## La chiave
Il pacchetto si apre solo con la chiave (43 caratteri). **Non va mai messa nel repo.** Sta in `pack.key` accanto agli script e nel link
`https://…/salotto/#k=<chiave>`: la parte dopo `#` non viene mai inviata al server, l'app la salva nel telefono e la toglie dall'indirizzo.

## Aggiornare il pacchetto
Copiare il nuovo file in `salotto/pack/salotto.bin` e alzare il numero in `PACK_URL` (`?v=`) in `salotto/real.js`: la cache del telefono lo rinnova.

   - lo split Daikin della parete A (`reg/ac_obj.py`, `console/ac_prep.py`, controllo `reg/ac_overlay.py`): prima era una decalcomania sfocata nella texture del muro, con le strisce di luce delle foto; ora e' un corpo 3D (75 cm, bordo alto a 2,727 m, sporge 22,5 cm, centrato sulla porta interna) con due facce (cappuccio, un po' inclinato in avanti, e fronte della bocca d'aria con feritoia e schermo) a cui la foto frontale dell'utente (81d8e52c, non registrata) e' raddrizzata sui due rettangoli del modello da quadrilateri letti sulla foto (`ac_prep.py`: rette adattate ai gradienti per i bordi del cappuccio, angoli della bocca d'aria sulla foto ingrandita; campionamento bilineare fra gli angoli, come l'UV della mesh), e fianchi/sopra/sotto in colore pieno col bianco medio della texture. La luce e' quella della porta interna (stesso guadagno: stessa foto). Il muro dietro si rifa' per diffusione (`wall_rects`, anche le strisce di luce) e prende un'ombra morbida (`shadow`). Misure: le foto non tornano del tutto fra loro (+-3 cm: la 4bd3d963 ha ~4,7 cm di errore in verticale gia' sul coprifilo della porta; la profondita' e' 18-32 cm dalle foto contro i 22,5 nominali; il cappuccio e' 20-24 cm): la forma e' una media, verificata con `ac_overlay.py` (il modello disegnato sulle due foto registrate; la 6d89137e e' quella che torna sul coprifilo a 1 mm). Un primo tentativo con la posa della foto frontale (omografia del rettangolo del cappuccio, camera nota) dava un cappuccio piu' alto del vero nelle foto registrate: scartato.
   - nicchia e termosifone, base e robot aspirapolvere (`reg/rad_obj.py`): sotto la finestra la parete ha un buco (manifesto `holes`, stesso z dell'apertura vecchia, dal pavimento a y = 0,86: sotto la finestra restano ~6 cm d'intonaco) con fondo e fianchi d'intonaco profondi 10 cm;
     dentro, il termosifone in ghisa a 13 elementi (z 0,79-1,57, y 0,09-0,75; misure dal muro cotto e dalla foto frontale: in metri veri ma a +-3 cm) con nervatura in rilievo, testata con apertura scura, lamiera forata,
     valvola a sinistra e testa termostatica a destra. Base (17 x 25 x 30 cm, logo arancione) e robot (disco di 32 cm con torretta e vetro) stanno sul pavimento contro il muro, davanti all'estremita' destra: ostacolo per la camminata
     (`scene_def`: `ostacolo_robot`); nel pavimento le due impronte si rifanno con un pezzo di marmo copiato 0,55 m piu' in la' e fuso (`floor()`), nel muro con la diffusione (`wall_rects`).
     Le fasce rifatte della parete W (finestra e nicchia, `WALL_EXCL['W']`) sfumano con uno smoothstep di 12 cm dal bordo verso l'interno (prima ~8 cm centrati sul bordo: si vedevano come righe lungo i lati);
     i margini sono piu' larghi (+10 cm) perche' la sfumatura cade dentro la zona gia' rifatta.
     `real.js` taglia la parete anche con buchi sovrapposti in larghezza (`wallWithHoles`: strisce verticali ai bordi dei buchi), serve alla finestra e alla nicchia sotto.