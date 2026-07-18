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

