// server/test/offline-sim.test.js — F8: browser (ESM) build of the simulation
//
// Verifies that build-sim.mjs produces a client/js/sim/ bundle that:
//   1. is fresh (re-running the build is idempotent)
//   2. imports cleanly as ES modules (window.CONFIG shimmed like the browser)
//   3. runs the same Game class with the same rules (endless wave progression,
//      soloInfo in state broadcasts — same expectations as endless.test.js)

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');

// Re-run the sync script: output must exist and be up to date
execFileSync(process.execPath, [path.join(ROOT, 'server', 'build-sim.mjs')], { stdio: 'pipe' });

// Browser shim: sim/config.js does `export default window.CONFIG` — in the
// browser window.CONFIG is set by the classic /js/config.js script; here we
// set it from the same shared source before importing the sim bundle.
globalThis.window = { CONFIG: require(path.join(ROOT, 'shared', 'config.js')) };

async function loadSim() {
  const mod = await import(pathToFileURL(path.join(ROOT, 'client', 'js', 'sim', 'game.js')).href);
  return { Game: mod.default, waveComposition: mod.waveComposition };
}

function makeGame(Game, options) {
  const messages = [];
  const room = { code: 'OFFLINE', state: 'playing', game: null };
  const players = [{ id: 'offline-player', name: 'Tester', ship: 0 }];
  const game = new Game(room, players, (m) => messages.push(m), options);
  return { game, messages };
}

test('sim bundle imports cleanly and exposes Game + waveComposition', async () => {
  const { Game, waveComposition } = await loadSim();
  assert.strictEqual(typeof Game, 'function');
  assert.strictEqual(typeof waveComposition, 'function');
  assert.strictEqual(waveComposition(1).count, 1);
  assert.strictEqual(waveComposition(5).count, 3);
  assert.strictEqual(waveComposition(7).difficulty, 'hard');
});

test('offline endless: wave progresses after clearing a wave', async (t) => {
  const { Game } = await loadSim();
  const { game, messages } = makeGame(Game, { soloMode: true, mode: 'endless' });
  t.after(() => game.stop());

  assert.strictEqual(game.soloGameMode, 'endless');
  assert.strictEqual(game.wave, 1);
  assert.strictEqual(game.aiShips.filter(a => a.alive).length, 1);

  // A few ticks of simulation
  for (let i = 0; i < 3; i++) game._update(0.1);

  // Kill the whole wave, then wait out the inter-wave delay
  for (const ai of game.aiShips) {
    if (ai.alive) game._killShip(ai, 'offline-player', 0);
  }
  assert.strictEqual(game.aiKilled, 1);
  for (let i = 0; i < 40 && game.wave === 1; i++) game._update(0.1);

  assert.strictEqual(game.wave, 2);
  assert.strictEqual(game.aiShips.filter(a => a.alive).length, 1);
  assert.ok(
    game.events.some(e => e.kind === 'wave_start') ||
    messages.some(m => m.type === 'event' && m.kind === 'wave_start'),
    'wave_start event missing'
  );
});

test('offline endless: state broadcast carries soloInfo.mode', async (t) => {
  const { Game } = await loadSim();
  const { game, messages } = makeGame(Game, { soloMode: true, mode: 'endless' });
  t.after(() => game.stop());

  game.ships['offline-player'].kills = 2;
  game._broadcastState();

  const state = messages.find(m => m.type === 'state');
  assert.ok(state, 'state message not broadcast');
  assert.strictEqual(state.soloInfo.mode, 'endless');
  assert.strictEqual(state.soloInfo.wave, 1);
  assert.strictEqual(state.soloInfo.score, 2);
  assert.strictEqual(state.soloInfo.lives, 3);
});

test('offline endless: defeat broadcasts solo_end like the server Game', async (t) => {
  const { Game } = await loadSim();
  const { game, messages } = makeGame(Game, { soloMode: true, mode: 'endless' });
  t.after(() => game.stop());

  const human = game.ships['offline-player'];
  for (let i = 0; i < 3; i++) game._killShip(human, null, null);
  game._checkRoundEnd();

  const end = messages.find(m => m.type === 'solo_end');
  assert.ok(end, 'solo_end not broadcast');
  assert.strictEqual(end.victory, false);
  assert.strictEqual(end.mode, 'endless');
  assert.strictEqual(end.wave, 1);
  assert.strictEqual(end.livesLeft, 0);
});

test('offline mission mode resolves missions from the sim bundle', async (t) => {
  const { Game } = await loadSim();
  const missions = await import(pathToFileURL(path.join(ROOT, 'client', 'js', 'sim', 'missions.js')).href);
  assert.ok(missions.missionList().length > 0, 'missionList is empty');

  const { game } = makeGame(Game, {
    soloMode: true, mode: 'mission', missionId: missions.missionList()[0].id,
  });
  t.after(() => game.stop());

  assert.ok(game.mission, 'mission not loaded');
  assert.strictEqual(game.soloGameMode, 'mission');
});
