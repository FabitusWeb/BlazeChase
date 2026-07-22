# Progetto: BLAZE CHASE

Remake web di **Chase Ace (Deluxe)** — arena shooter top-down 2-4 giocatori nel browser, stile e meccaniche fedeli all'originale. **Con permesso scritto degli autori (Biodome Games / Space Time Foam) via email** → archiviare il testo in `PERMISSION.md` (in attesa del testo da Fabitus).

## Contesto cliente
- Cliente: Fabitus (progetto interno, fan remake autorizzato)
- Obiettivo: gioco online CA-like al 100% (grafica, meccaniche, livelli, feel)
- Prod: https://blazechase-ws.zusho.it (Coolify su VPS, deploy automatico via webhook GitHub → push su `main`)

## Stack
- Server: Node.js (`server/`, no framework, `ws`), game loop autoritativo 60Hz, state a 30Hz
- Client: canvas 2D vanilla ES modules (`client/`), niente build step; HiDPI adattivo (resScale 1→2, salvato in localStorage `blazechase_rescale`)
- Shared: `shared/config.js` = unica fonte di verità per le costanti (servita al client da `/js/config.js`)
- Sim offline: `client/js/sim/` = conversione ESM dei moduli server via `npm run build:sim` (server/build-sim.mjs) — NON editare a mano
- Test: `node --test test/` in `server/` — **119/119 verdi** al 21/07

## Stato avanzamento (al 21/07/2026)

### Completato e live
- **F1-F4**: base multiplayer, 11 armi, 5 navi, powerup, 9 arene handcrafted + picker; single player SKIRMISH / MISSIONS (6) / ENDLESS + leaderboard localStorage (`blazechase_scores`, `blazechase_missions`)
- **F5 stabilità**: heartbeat timestamp 15s, auto-reconnect backoff, **F5c rejoin partita in corso** (slot disconnesso 15s per nome, stesso player id, `sendArena`), overlay comandi (H), risoluzione rendering adattiva persistente
- **F6 grafica CA**: starfield, muri industriali, esplosioni a nastri frastagliati + fumo spirale (swirl) + anelli multipli, mattoni gialli distruttibili → **ora casse di legno e muro giallo ORIGINALI CA** (`client/assets/tiles/`, fallback procedurale), HUD top AMMO/SHIELD + CURRENT WEAPON + DANGER, bolt proiettili, navi look pre-renderizzato (F10), HiDPI 2x, rendering hazard (torrette/mine/buchi neri/onda/porte/pistoni/lazer trap/stickies/path vehicles)
- **F7 meccaniche livello CA**: gravity zones, wormholes a coppie, **porte+trigger (bottoni rossi sparabili, gruppi 3/4 + b/n), one-way walls (u/j/h/k), pistoni crusher (Z), F7c path vehicles** (`pathVehicles` nei layout, waypoints tile coords, primo in ca-chase)
- **F7-import**: 6 arene convertite dai `.lev` originali (ca-chase, ca-violent-skew, ca-tripple-a, ca-rooms-of-chaos, ca-interconnection-void, ca-crashsite) via `server/tools/import-lev.mjs`; righe/colonne di D>4 → '#' (casse sparse come in CA)
- **F8 offline mode**: banner GIOCA OFFLINE, simulazione client-side completa
- **F9 audio**: WebAudio per tipo arma (11 preset + 4 nuove), engine hum con pitch turbo, allarmi, door/button
- **F11a arsenale CA**: SNEAKY MISSILE (11), CENTERBLAST (12), STICKY BOMB (13, fuse 1.5s, attacca navi/muri), LAZER TRAP (14, tripwire 15s, `CONFIG.LAZERTRAP`)
- **F11 stats CA**: `accel` e `turbo` per nave dai valori decodificati (BLAZE turbo 2.0 = Martinez, TITAN 550/200, HORNET 1400/1.9); anche l'AI usa def.accel

### Riferimenti (`.refs-tmp/`, gitignored)
- `MECCANICA.md` — BIBBIA: formato CHZ_RS2, FANCYSMANCY (stats navi), ENEMYIQ (AI), formato `.lev` (testo), corsi, 36 powerup POW*
- `SPEC-VISIVA.md` — spec grafica dai video
- `screens/`, `clean-room/` — 23 screenshot riferimento + dossier Manus
- Asset originali estratti in `/home/coder/chaseace-original/assets/` (65 BMP + 12 WAV) — riferimento, NON nel repo tranne i 4 tile committati

### Roadmap prossime fasi
- **F12 — UI stile CA**: menu giallo/blu, minimappa nel picker arene, ship select 9 stats + sketch, GAME OVER stats complete
- **F13 — Arene varietà**: canali d'acqua/fratture, stanze tema circuito (da refs clean-room)
- **F14 — Più asset originali**: navi dai sprite sheet originali (PLAYER1-4.bmp), esplosioni da EXPLODE.bmp, powerup da POWERUPS.bmp, starbackground.bmp
- **F15 — AI CA**: comportamenti dai 26 .NMY (skill/reaction/vision/range da ENEMYIQ), nemici che spawnano nemici (missile→MISSILE2)
- **F16 — Più armi CA**: GAZ, ARTILLERY, MICRO BLASTER, BOOMERANG, TIME BLAST + powerup DEFLECTOR/HOMING TURRET/MINI TURRETS
- Infra (fuori repo): uptime monitor prod, testo mail Biodome → PERMISSION.md

## Regole operative
- Lingua: italiano nei commenti e commit message
- Commit message: brevi e descrittivi; push su `master` → `main` (deploy automatico)
- Test sempre verdi prima di pushare (`cd server && npm test`); dopo modifiche server: `npm run build:sim`
- Asset CA: SOLO con permesso (ottenuto); testo email in PERMISSION.md appena disponibile
- Deploy: automatico via webhook, ~1 min dal push

## Memory (pattern tecnici chiave)
- Pattern test Game: `new Game(room, players, broadcast, opts)` senza `start()`, guidare `_update(dt)`/`_checkRoundEnd()` a mano; `t.after(() => game.stop())`
- Smoke client in Node: stub OffscreenCanvas + ctx Proxy; `loadTileSprites()` degrada senza `Image`
- Formato CHZ_RS2: magic 8B + count 1B + entry 33B (nome 25B + ofs u32 + size u32); payload spesso a ofs-1
- Layout arene ASCII: `# D . A R G S P M T O B < > ^ v 1 2 3 4 b n Z u j h k` + `pathVehicles` nei layout JS
- Causa disconnessioni storica: reload config Caddy/coolify-proxy (fix lato VPS: polling 30s + grace); lato client: reconnect + F5c rejoin
