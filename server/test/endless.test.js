// server/test/endless.test.js — endless mode: wave composition + progression

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Game = require('../src/game');
const { waveComposition } = Game;

function makeGame(options) {
  const messages = [];
  const room = { code: 'TEST', state: 'playing', game: null };
  const players = [{ id: 'p1', name: 'Tester', ship: 0 }];
  const game = new Game(room, players, (m) => messages.push(m), options);
  return { game, messages };
}

test('waveComposition ramps AI count 1 → 3', () => {
  assert.strictEqual(waveComposition(1).count, 1);
  assert.strictEqual(waveComposition(2).count, 1);
  assert.strictEqual(waveComposition(3).count, 2);
  assert.strictEqual(waveComposition(4).count, 2);
  assert.strictEqual(waveComposition(5).count, 3);
  assert.strictEqual(waveComposition(10).count, 3);
  assert.strictEqual(waveComposition(50).count, 3);
});

test('waveComposition ramps difficulty easy → medium → hard', () => {
  assert.strictEqual(waveComposition(1).difficulty, 'easy');
  assert.strictEqual(waveComposition(3).difficulty, 'easy');
  assert.strictEqual(waveComposition(4).difficulty, 'medium');
  assert.strictEqual(waveComposition(6).difficulty, 'medium');
  assert.strictEqual(waveComposition(7).difficulty, 'hard');
  assert.strictEqual(waveComposition(20).difficulty, 'hard');
});

test('endless starts at wave 1 with a single AI', (t) => {
  const { game } = makeGame({ soloMode: true, mode: 'endless' });
  t.after(() => game.stop());

  assert.strictEqual(game.soloGameMode, 'endless');
  assert.strictEqual(game.wave, 1);
  assert.strictEqual(game.aiShips.filter(a => a.alive).length, 1);
  assert.strictEqual(game.playerLives, 3);
});

test('clearing a wave spawns the next one after a delay', (t) => {
  const { game, messages } = makeGame({ soloMode: true, mode: 'endless' });
  t.after(() => game.stop());

  game._killShip(game.aiShips[0], 'p1', 0);
  assert.strictEqual(game.aiKilled, 1);

  // Wave 2 must not arrive immediately
  game._update(0.1);
  assert.strictEqual(game.wave, 1);

  // After ~3s of updates the next wave spawns
  for (let i = 0; i < 40 && game.wave === 1; i++) game._update(0.1);
  assert.strictEqual(game.wave, 2);
  assert.strictEqual(game.aiShips.filter(a => a.alive).length, 1);  // wave 2: still 1 AI

  const waveEvent = messages.find(m => m.type === 'event' && m.kind === 'wave_start');
  // events are flushed via _tick, not _update — check game.events instead
  assert.ok(waveEvent || game.events.some(e => e.kind === 'wave_start'), 'wave_start event missing');
});

test('wave 3 brings 2 AI ships', (t) => {
  const { game } = makeGame({ soloMode: true, mode: 'endless' });
  t.after(() => game.stop());

  game.wave = 2;
  for (const ai of game.aiShips) game._killShip(ai, 'p1', 0);
  for (let i = 0; i < 40 && game.wave === 2; i++) game._update(0.1);

  assert.strictEqual(game.wave, 3);
  assert.strictEqual(game.aiShips.filter(a => a.alive).length, 2);
});

test('killed AI do not respawn mid-wave in endless', (t) => {
  const { game } = makeGame({ soloMode: true, mode: 'endless' });
  t.after(() => game.stop());

  game.wave = 3;
  game._spawnAIWave(2, 'easy');
  game._killShip(game.aiShips[0], 'p1', 0);
  assert.strictEqual(game.aiShips[0].respawnTimer, 9999);
});

test('endless never ends in victory, only in defeat', (t) => {
  const { game, messages } = makeGame({ soloMode: true, mode: 'endless' });
  t.after(() => game.stop());

  const human = game.ships['p1'];
  for (let i = 0; i < 3; i++) game._killShip(human, null, null);
  game._checkRoundEnd();

  const end = messages.find(m => m.type === 'solo_end');
  assert.ok(end, 'solo_end not broadcast');
  assert.strictEqual(end.victory, false);
  assert.strictEqual(end.mode, 'endless');
  assert.strictEqual(end.wave, 1);
});

test('endless score = kills + 5 per cleared wave', (t) => {
  const { game, messages } = makeGame({ soloMode: true, mode: 'endless' });
  t.after(() => game.stop());

  game.wave = 4;                       // 3 waves cleared
  game.ships['p1'].kills = 7;
  for (let i = 0; i < 3; i++) game._killShip(game.ships['p1'], null, null);
  game._checkRoundEnd();

  const end = messages.find(m => m.type === 'solo_end');
  assert.strictEqual(end.score, 7 + 5 * 3);
});

test('soloInfo carries wave and score in endless', (t) => {
  const { game, messages } = makeGame({ soloMode: true, mode: 'endless' });
  t.after(() => game.stop());

  game.ships['p1'].kills = 2;
  game._broadcastState();

  const state = messages.find(m => m.type === 'state');
  assert.strictEqual(state.soloInfo.mode, 'endless');
  assert.strictEqual(state.soloInfo.wave, 1);
  assert.strictEqual(state.soloInfo.score, 2);
  assert.strictEqual(state.soloInfo.objective, null);
});
