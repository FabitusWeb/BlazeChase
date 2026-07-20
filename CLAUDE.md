# Progetto: [NOME PROGETTO]

## Contesto cliente
- Cliente: 
- Obiettivo: 
- Budget/tipo: (es. statico <2k/anno, custom, e-commerce...)

## Stack scelto
> Da definire all'inizio del progetto con Claude.
> Prima cosa da fare: "Leggi il CLAUDE.md e aiutami a scegliere lo stack migliore per questo progetto"

## Decisioni architetturali
> Aggiorna questa sezione dopo ogni sessione con le scelte fatte e il perché.

## Regole operative
- Lingua: italiano nei commenti e commit message
- Commit message: brevi e descrittivi
- Prima di modifiche grosse: crea un branch
- Dopo ogni sessione: aggiorna questo CLAUDE.md
- Deploy: chiedi sempre conferma prima di andare in prod

## Memory
> Problemi risolti, pattern usati, cose da ricordare la prossima sessione.

- **F3 completata** (working tree, non committata): 9 arene handcrafted in `server/src/arenas.js`, picker arena in lobby e solo, 49 test.
- **F4 completata** (working tree, non committata): modalità single player MISSIONS (6 missioni in `server/src/missions.js`, obiettivi eliminate/survive/turrets) ed ENDLESS (ondate AI crescenti, `waveComposition` in `game.js`). Il solo mode ora ha `mode`: 'skirmish' (default, invariato) | 'mission' | 'endless'. Messaggi: `play_solo` accetta `mode` + `missionId`; `welcome` porta `missions`; `solo_end` e `soloInfo` estesi con `mode, wave, objective, score`. Completamento missioni e leaderboard in localStorage client (`blazechase_missions`, `blazechase_scores`). 70/70 test verdi (`cd server && npm test`).
- Pattern test Game: istanziare `new Game(room, players, broadcast, opts)` senza `start()` e guidare `_update(dt)` / `_checkRoundEnd()` a mano; sempre `t.after(() => game.stop())` per pulire i timer.

## Roadmap prossime fasi
- **F5 — Giocabilità**: ✅ heartbeat, reconnect, cap particelle, overlay comandi, auto-reconnect F5b, risoluzione adattiva.
- **F6 — Grafica CA Deluxe**: ✅ F6.1/F6.2 + bolt + rim light + HiDPI + rendering hazard.
- **F7 — Hazards CA**: ✅ F7a (gravity, wormhole) + import 6 arene originali .lev (ca-chase, ca-violent-skew, ca-tripple-a, ca-rooms-of-chaos, ca-interconnection-void, ca-crashsite). Resta **F7b**: porte+trigger (bottoni rossi), pistoni/crusher, one-way, path vehicles — i livelli originali li usano (formati in MECCANICA.md).
- **F8 — Offline solo mode**: ✅ simulazione client-side via build-sim.
- **F10 — Sprite navi pre-renderizzate**: navi con look 3D/sprite CA (volumi, outline), il gap visivo maggiore rimasto.
- **F9 — Audio stile CA**: WebAudio sullo stile degli 87 SFX originali (spari per arma, esplosioni juicy, motore, pickup, DANGER).
- **F11a — Arsenale CA**: LAZER TRAP (tripwire), GAZ, STICKY BOMBS, SNEAKY/CONFUSED MISSILES, ARTILLERY, MICRO BLASTER, BOOMERANG, TIME BLAST, CENTERBLAST + powerup DEFLECTOR/POWERSHIELD2/HOMING TURRET/MINI TURRETS (schede POW* in MECCANICA.md).
- **F11 — Palette CA**: stats navi/armi/AI ribilanciate sui valori originali decodificati (FANCYSMANCY, ENEMYIQ).
- **F12 — UI stile CA**: menu giallo/blu, minimappa nel picker, ship select 9 stats + sketch.
- **F13 — Arene varietà**: canali d'acqua, fratture, stanze tema circuito (da refs clean-room).
- Infra (fuori dal repo): restart policy Coolify ✅, webhook auto-deploy ✅, fix polling proxy (30s, da orion), uptime monitor.

