// server/test/enemies-f15b.test.js — F15b: archetipi nemici + skirmish keep 'em coming

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const CONFIG = require('../src/config');
const Game   = require('../src/game');
const { createAIShip } = require('../src/enemies');

function makeSoloGame(opts = {}) {
  const room = { code: 'TEST', state: 'playing', game: null };
  const players = [{ id: 'p1', name: 'HUMAN', ship: 0 }];
  const game = new Game(room, players, () => {}, {
    soloMode: true, difficulty: 'medium', arenaId: 'training-grounds',
    mode: opts.mode || 'skirmish', ...opts,
  });
  return game;
}

test('archetipi: bzzt è rammer senza fuoco, missile1 spara missili', (t) => {
  const sp = { x: 100, y: 100 };
  const bzzt = createAIShip('a1', sp, 0, 'medium', 'bzzt');
  assert.strictEqual(bzzt.ram, true);
  assert.strictEqual(bzzt.enemyType, 'bzzt');
  assert.ok(bzzt.diff.speedMult > 1, 'bzzt più veloce del profilo base');

  const m1 = createAIShip('a2', sp, 0, 'hard', 'missile1');
  assert.strictEqual(m1.weapon, 3, 'missile1 usa MISSILE');
  assert.deepStrictEqual(Object.keys(m1.weapons).map(Number), [3]);

  const slow = createAIShip('a3', sp, 0, 'easy', 'slow');
  assert.ok(slow.diff.speedMult < (0.70), 'slow più lento del profilo easy');
});

test('archetipi: il tipo viene scelto dal pool della difficoltà', (t) => {
  const sp = { x: 100, y: 100 };
  const pools = {
    easy:   new Set(['stupid', 'slow']),
    medium: new Set(['good', 'cool', 'bzzt']),
    hard:   new Set(['expert', 'missile1']),
  };
  for (const [diff, pool] of Object.entries(pools)) {
    for (let i = 0; i < 20; i++) {
      const ai = createAIShip('a' + i, sp, 0, diff);
      assert.ok(pool.has(ai.enemyType), `${diff}: tipo inatteso ${ai.enemyType}`);
    }
  }
});

test('skirmish keep em coming: l\'AI uccisa respawna', (t) => {
  const game = makeSoloGame();
  t.after(() => game.stop());
  assert.strictEqual(game._aiShouldRespawn(), true, 'skirmish: respawn continuo');
});

test('skirmish: vittoria al kill target, non a wipe dei nemici', (t) => {
  const game = makeSoloGame();
  t.after(() => game.stop());

  // Wipe dei nemici SENZA kill target: la partita continua (respawn attivi)
  const human = Object.values(game.ships).find(s => !s.isAI);
  human.kills = CONFIG.KILL_TARGET - 1;
  for (const ai of game.aiShips) ai.alive = false;
  game._checkRoundEnd();
  assert.strictEqual(game.roundOver, false, 'wipe senza kill target: si continua');

  // Kill target raggiunto: vittoria
  human.kills = CONFIG.KILL_TARGET;
  game._checkRoundEnd();
  assert.strictEqual(game.roundOver, true, 'kill target: vittoria');
});

test('matchlog: logMatch non throw e scrive JSONL', (t) => {
  const fs = require('fs');
  const path = require('path');
  // logMatch scrive in server/logs — i file di test girano in processi
  // paralleli sullo stesso JSONL: cerchiamo la NOSTRA riga, non l'ultima
  const { logMatch } = require('../src/matchlog');
  assert.doesNotThrow(() => logMatch({ mode: 'test', arena: 'x', victory: true }));
  const file = path.resolve(__dirname, '../logs/matches.jsonl');
  const found = fs.readFileSync(file, 'utf8').trim().split('\n')
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .some(e => e && e.mode === 'test' && e.ts);
  assert.ok(found, 'riga di test trovata nel JSONL');
});
