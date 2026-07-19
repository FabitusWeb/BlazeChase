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
- **F5 — Giocabilità**: fix heartbeat/disconnessione (timeout reale 15s, ora ~5s per bug), cap particelle anti-lag, overlay comandi in gioco (H).
- **F6 — Grafica Chase Ace Deluxe**: ✅ F6.1 (starfield, muri industriali, fireball) + ✅ F6.2 (nastri fiamma frastagliati, fumo spirale, mattoni gialli distruttibili, metallo blu-grigio, HUD top AMMO/SHIELD, DANGER, GAME OVER stats). Riferimenti in `.refs-tmp/` (SPEC-VISIVA.md, MECCANICA.md = bibbia meccanica decodificata dai file originali).
- **F7 — Hazards CA**: gravity zones, wormhole, one-way, porte/pistoni con trigger, path vehicles, fogger. Formati livelli originali decodificati (testo, sezioni in MECCANICA.md).
- **F8 — Offline solo mode**: simulazione client-side (moduli server puri + shim CJS→ESM), fallback quando il server è giù. Carico browser trascurabile (<1ms/tick). Motivazione: down prod 16/06–18/07, un mese offline silenzioso.
- **F9+ (idee)**: LAZER TRAP (tripwire), GAZ, billboards sui muri, ship select a 9 stats, campagne, tema circuito THINK, audio stile CA.
- Infra (fuori dal repo): restart policy `unless-stopped` per Coolify ✅ (fatto da orion), uptime monitor su prod, memory limit container, webhook GitHub→Coolify per auto-deploy.

