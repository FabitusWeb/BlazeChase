// server/test/missions.test.js — mission definitions + mission mode in Game

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { MISSIONS, getMission, missionList } = require('../src/missions');
const { getArena } = require('../src/arenas');
const Game = require('../src/game');

const DIFFS = ['easy', 'medium', 'hard'];

function makeGame(options) {
  const messages = [];
  const room = { code: 'TEST', state: 'playing', game: null };
  const players = [{ id: 'p1', name: 'Tester', ship: 0 }];
  const game = new Game(room, players, (m) => messages.push(m), options);
  return { game, messages };
}

test('every mission references a valid arena', () => {
  for (const m of MISSIONS) {
    assert.doesNotThrow(() => getArena(m.arenaId), `${m.id}: invalid arenaId '${m.arenaId}'`);
  }
});

test('every mission has a valid shape', () => {
  for (const m of MISSIONS) {
    assert.ok(m.id && typeof m.id === 'string', 'id');
    assert.ok(m.name && typeof m.name === 'string', 'name');
    assert.ok(m.desc && typeof m.desc === 'string', 'desc');
    assert.ok(DIFFS.includes(m.difficulty), `${m.id}: bad difficulty`);
    assert.ok(Number.isInteger(m.lives) && m.lives > 0, `${m.id}: bad lives`);
    assert.ok(Number.isInteger(m.aiCount) && m.aiCount >= 1 && m.aiCount <= 3, `${m.id}: bad aiCount`);

    const obj = m.objective;
    assert.ok(obj && typeof obj === 'object', `${m.id}: missing objective`);
    if (obj.type === 'eliminate') {
      assert.ok(Number.isInteger(obj.kills) && obj.kills > 0, `${m.id}: bad kills`);
    } else if (obj.type === 'survive') {
      assert.ok(obj.seconds > 0, `${m.id}: bad seconds`);
    } else {
      assert.strictEqual(obj.type, 'turrets', `${m.id}: unknown objective type '${obj.type}'`);
    }
  }
});

test('missionList exposes picker shape without internals', () => {
  const list = missionList();
  assert.strictEqual(list.length, MISSIONS.length);
  for (const item of list) {
    assert.deepStrictEqual(Object.keys(item).sort(), ['desc', 'difficulty', 'id', 'name']);
  }
});

test('getMission returns the mission or null', () => {
  assert.ok(getMission(MISSIONS[0].id));
  assert.strictEqual(getMission('no-such-mission'), null);
});

test('turrets missions are placed in arenas that actually have turrets', () => {
  for (const m of MISSIONS) {
    if (m.objective.type !== 'turrets') continue;
    const arena = getArena(m.arenaId);
    assert.ok(arena.hazards.turrets.length > 0, `${m.id}: arena '${m.arenaId}' has no turrets`);
  }
});

test('eliminate mission ends in victory when kill target is met', (t) => {
  const { game, messages } = makeGame({ soloMode: true, mode: 'mission', missionId: 'first-blood' });
  t.after(() => game.stop());

  assert.strictEqual(game.mission.id, 'first-blood');
  assert.strictEqual(game.soloDiff, 'easy');
  assert.strictEqual(game.playerLives, 3);
  assert.strictEqual(game.aiShips.length, 3);

  for (const ai of game.aiShips) game._killShip(ai, 'p1', 0);
  game._checkRoundEnd();

  const end = messages.find(m => m.type === 'solo_end');
  assert.ok(end, 'solo_end not broadcast');
  assert.strictEqual(end.victory, true);
  assert.strictEqual(end.mode, 'mission');
  assert.strictEqual(end.missionId, 'first-blood');
  assert.strictEqual(end.missionName, 'FIRST BLOOD');
});

test('eliminate mission respawns AI while more kills are needed', (t) => {
  // crossfire-arena: 3 AI at a time, 5 kills to win
  const { game } = makeGame({ soloMode: true, mode: 'mission', missionId: 'crossfire-arena' });
  t.after(() => game.stop());

  const first = game.aiShips[0];
  game._killShip(first, 'p1', 0);
  assert.strictEqual(game.aiKilled, 1);
  assert.ok(first.respawnTimer < 9999, 'AI should respawn: kills still needed');

  // Drive updates until the AI comes back
  for (let i = 0; i < 60 && !first.alive; i++) game._update(0.1);
  assert.ok(first.alive, 'AI did not respawn');
});

test('survive mission ends in victory when the timer runs out', (t) => {
  const { game, messages } = makeGame({ soloMode: true, mode: 'mission', missionId: 'acid-test' });
  t.after(() => game.stop());

  assert.strictEqual(game.missionTimer, 60);
  game.missionTimer = 0.05;
  game._update(0.1);   // timer hits zero
  game._checkRoundEnd();

  const end = messages.find(m => m.type === 'solo_end');
  assert.ok(end, 'solo_end not broadcast');
  assert.strictEqual(end.victory, true);
});

test('turrets mission ends in victory when all turrets are destroyed', (t) => {
  const { game, messages } = makeGame({ soloMode: true, mode: 'mission', missionId: 'turret-hunter' });
  t.after(() => game.stop());

  assert.ok(game.turrets.length > 0);
  for (const turret of game.turrets) game._damageTurret(turret, 99999, 'p1');
  game._checkRoundEnd();

  const end = messages.find(m => m.type === 'solo_end');
  assert.ok(end, 'solo_end not broadcast');
  assert.strictEqual(end.victory, true);
});

test('mission ends in defeat when lives run out', (t) => {
  const { game, messages } = makeGame({ soloMode: true, mode: 'mission', missionId: 'first-blood' });
  t.after(() => game.stop());

  const human = game.ships['p1'];
  for (let i = 0; i < 3; i++) game._killShip(human, null, null);
  game._checkRoundEnd();

  const end = messages.find(m => m.type === 'solo_end');
  assert.ok(end, 'solo_end not broadcast');
  assert.strictEqual(end.victory, false);
  assert.strictEqual(end.livesLeft, 0);
});

test('unknown mission id falls back to skirmish', (t) => {
  const { game } = makeGame({ soloMode: true, mode: 'mission', missionId: 'nope', difficulty: 'hard' });
  t.after(() => game.stop());

  assert.strictEqual(game.soloGameMode, 'skirmish');
  assert.strictEqual(game.mission, null);
  assert.strictEqual(game.soloDiff, 'hard');
});

test('soloInfo carries mission objective progress', (t) => {
  const { game, messages } = makeGame({ soloMode: true, mode: 'mission', missionId: 'first-blood' });
  t.after(() => game.stop());

  game._killShip(game.aiShips[0], 'p1', 0);
  game._broadcastState();

  const state = messages.find(m => m.type === 'state');
  assert.ok(state.soloInfo);
  assert.strictEqual(state.soloInfo.mode, 'mission');
  assert.deepStrictEqual(state.soloInfo.objective, { text: 'KILLS', progress: 1, target: 3 });
});
