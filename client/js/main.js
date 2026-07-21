// client/js/main.js — Game state machine and boot

import { NetClient }    from './net.js';
import { InputManager } from './input.js';
import { Renderer }     from './renderer.js';
import { AudioManager } from './audio.js';
import { startOfflineGame, stopOfflineGame, offlineArenaList, offlineMissionList, OFFLINE_PLAYER_ID } from './offline.js';

// ── Globals ───────────────────────────────────────────────────
const net   = new NetClient();
const input = new InputManager();
const audio = new AudioManager();

let renderer    = null;
let myId        = null;
let currentRoom = null;
let myShip      = 0;
let myName      = 'Player';
let soloMode    = false;
let lastSoloDiff = 'easy';
let offlineMode  = false;   // true after "GIOCA OFFLINE": solo runs locally
let offlineGame  = null;    // local Game instance while an offline match runs
let serverArenas  = [];   // arena list from the server welcome message
let serverMissions = [];  // mission list from the server welcome message
let soloGameMode  = 'skirmish';   // 'skirmish' | 'mission' | 'endless'
let selectedMissionId = null;

// Game state received from server
let arenaData   = null;
let gameState   = null;    // latest interpolated state
let killFeed    = [];      // { text, color, timer }
let activePowerups = [];   // { ptype, timer }

// rAF loop handle
let rafId = null;
let lastFrameTime = 0;

// ── State machine ─────────────────────────────────────────────
const STATES = { MENU: 'menu', SOLO: 'solo', LOBBY: 'lobby', COUNTDOWN: 'countdown', PLAYING: 'playing', SCOREBOARD: 'scoreboard', SOLO_END: 'solo-end', LEADERBOARD: 'leaderboard' };
let state = STATES.MENU;

// Auto-resume dopo reconnect (F5b): un drop del proxy non deve interrompere il gioco
let everConnected  = false;
let lastSoloParams = null;   // payload play_solo per riprendere il solo
let lastJoinInfo   = null;   // { code?, name, ship } per rientrare in room

function setState(s) {
  state = s;
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById(`screen-${s}`)?.classList.add('active');
}

// ── Boot ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  setupMenuUI();
  net.connect();

  net.on('connected', () => {

  });

  net.on('disconnected', () => {
        showMenuError('Connessione persa — riconnessione…');
    if (state !== STATES.MENU) setState(STATES.MENU);
    if (state === STATES.MENU) showOfflineBanner();
  });

  net.on('reconnecting', () => {
    showMenuError('Connessione persa, riconnessione…');
  });

  net.on('error', () => {
    showMenuError('Connection error. Is the server running?');
    if (state === STATES.MENU) showOfflineBanner();
  });

  net.on('welcome', (msg) => {
    const isReconnect = everConnected;
    everConnected = true;
    myId  = msg.id;
    net.myId = myId;
    offlineMode = false;   // server is reachable — back to online lists
    hideOfflineBanner();
    serverArenas = msg.arenas || [];
    serverMissions = msg.missions || [];
    populateArenaSelects();
    // F5b: dopo un drop, riprendi la partita da dove eri
    if (isReconnect) {
      if (lastSoloParams) resumeSoloGame();
      else if (lastJoinInfo) net.send({ type: 'join', ...lastJoinInfo });
    }
  });

  net.on('lobby', (msg) => {
    currentRoom = msg;
    if (state === STATES.MENU || state === STATES.SCOREBOARD) setState(STATES.LOBBY);
    updateLobbyUI(msg);
  });

  net.on('lobby_reset', () => {
    setState(STATES.LOBBY);
    if (currentRoom) updateLobbyUI(currentRoom);
  });

  net.on('error', (msg) => {
    if (msg.msg) showMenuError(msg.msg);
    // Rejoin fallito dopo reconnect: smetti di riprovare
    if (msg.msg && /Room not found|Game in progress|Room full/.test(msg.msg)) {
      lastJoinInfo = null;
    }
  });

  net.on('countdown', (msg) => {
    setState(STATES.COUNTDOWN);
    const el = document.getElementById('countdown-num');
    el.textContent = msg.value === 0 ? 'GO!' : String(msg.value);
    el.style.animation = 'none';
    el.offsetHeight; // reflow
    el.style.animation = '';
    audio.countdownBeep(msg.value);
  });

  net.on('countdown_cancel', () => {
    _pendingStart = false;
    setState(STATES.LOBBY);
    if (currentRoom) updateLobbyUI(currentRoom);
  });

  net.on('arena', handleArenaMsg);

  net.on('round_end', (msg) => {
    stopGameLoop();
    input.stop();
    showScoreboard(msg);
    setState(STATES.SCOREBOARD);
  });

  net.on('solo_end', handleSoloEndMsg);

  // Game events
  net.on('event', (msg) => {
    try { handleGameEvent(msg); } catch (e) { console.error('[BLAZE] event handler crash:', e, 'msg:', msg); }
  });

  // Controls overlay: H toggles, ESC closes
  window.addEventListener('keydown', (e) => {
    if (e.key === 'h' || e.key === 'H') {
      document.getElementById('controls-overlay')?.classList.toggle('hidden');
    } else if (e.key === 'Escape') {
      document.getElementById('controls-overlay')?.classList.add('hidden');
    }
  });

  setState(STATES.MENU);
});

// ── Menu UI ───────────────────────────────────────────────────
function setupMenuUI() {
  document.getElementById('btn-solo').addEventListener('click', () => {
    setState(STATES.SOLO);
    buildSoloShipGrid();
    buildMissionList();
    document.getElementById('solo-name').focus();
  });

  document.getElementById('btn-leaderboard').addEventListener('click', () => {
    setState(STATES.LEADERBOARD);
    buildLeaderboard('easy');
  });

  // Offline solo mode: server unreachable → play entirely in the browser
  document.getElementById('btn-offline')?.addEventListener('click', () => {
    offlineMode = true;
    hideOfflineBanner();
    populateArenaSelects();
    setState(STATES.SOLO);
    buildSoloShipGrid();
    buildMissionList();
  });

  const btnCreate = document.getElementById('btn-create');
  const btnJoin   = document.getElementById('btn-join');
  const createForm = document.getElementById('create-form');
  const joinForm   = document.getElementById('join-form');

  btnCreate.addEventListener('click', () => {
    createForm.classList.remove('hidden');
    joinForm.classList.add('hidden');
    document.getElementById('input-name-create').focus();
  });

  btnJoin.addEventListener('click', () => {
    joinForm.classList.remove('hidden');
    createForm.classList.add('hidden');
    document.getElementById('input-code').focus();
  });

  document.getElementById('btn-create-confirm').addEventListener('click', () => {
    if (!net.connected) { showMenuError('Not connected to server. Please wait...'); return; }
    myName = document.getElementById('input-name-create').value.trim() || 'Player';
    lastJoinInfo = { name: myName, ship: myShip };
    net.send({ type: 'join', name: myName, ship: myShip });
  });

  document.getElementById('btn-join-confirm').addEventListener('click', () => {
    if (!net.connected) { showMenuError('Not connected to server. Please wait...'); return; }
    const code = document.getElementById('input-code').value.toUpperCase().trim();
    myName = document.getElementById('input-name').value.trim() || 'Player';
    if (!code || code.length !== 4) { showMenuError('Enter a 4-letter room code'); return; }
    lastJoinInfo = { code, name: myName, ship: myShip };
    net.send({ type: 'join', code, name: myName, ship: myShip });
  });

  // Enter key support
  document.getElementById('input-code').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-join-confirm').click();
  });
  document.getElementById('input-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-join-confirm').click();
  });
  document.getElementById('input-name-create').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-create-confirm').click();
  });
}

function showMenuError(msg) {
  const el = document.getElementById('menu-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

// ── Offline mode (F8) ───────────────────────────────────────
function showOfflineBanner() {
  document.getElementById('offline-banner')?.classList.remove('hidden');
}

function hideOfflineBanner() {
  document.getElementById('offline-banner')?.classList.add('hidden');
}

// Shared handlers: used for server messages AND local offline Game broadcasts
function handleArenaMsg(msg) {
  arenaData = msg;
  net.clearStateBuffer();
  killFeed = [];
  activePowerups = [];
  if (_soloTimeout) { clearTimeout(_soloTimeout); _soloTimeout = null; }
  // If countdown already fired or solo waiting, start now
  if (_pendingStart) {
    _pendingStart = false;
    try { startGame(); } catch (e) { console.error('[BLAZE] startGame error:', e); showMenuError('Game start error: ' + e.message); setState(STATES.MENU); }
  }
}

function handleSoloEndMsg(msg) {
  lastSoloParams = null;   // partita finita: niente da riprendere dopo un reconnect
  try { saveScore(msg); } catch (e) { console.warn('saveScore error:', e); }
  // Celebrazione: lascia giocare l'esplosione finale, la schermata arriva dopo
  setTimeout(() => {
    stopGameLoop();
    input.stop();
    soloMode = false;
    showSoloEnd(msg);
    setState(STATES.SOLO_END);
  }, 2200);
}

// F5b: dopo un reconnect, riparte il solo con le stesse opzioni (il server
// crea una nuova room privata — la vecchia è stata distrutta alla disconnessione)
function resumeSoloGame() {
  const p = lastSoloParams;
  if (!p) return;
  soloMode = true;
  arenaData = null;
  killFeed = [];
  activePowerups = [];
  _pendingStart = true;
  if (!net.send(p)) return;   // non ancora connesso: riproverà al prossimo welcome
  setState(STATES.COUNTDOWN);
  document.getElementById('countdown-num').textContent = '...';
}

// Dispatch for broadcasts from the LOCAL Game (offline solo mode):
// same handlers as net messages, but state goes straight to gameState
// (no interpolation buffer — the simulation is local, there is no lag).
function handleOfflineMessage(msg) {
  switch (msg.type) {
    case 'arena':
      handleArenaMsg(msg);
      break;
    case 'state':
      gameState = msg;
      break;
    case 'event':
      try { handleGameEvent(msg); } catch (e) { console.error('[BLAZE] event handler crash:', e, 'msg:', msg); }
      break;
    case 'solo_end':
      offlineGame = null;
      stopOfflineGame();
      handleSoloEndMsg(msg);
      break;
  }
}

// ── Lobby UI ──────────────────────────────────────────────────
// Fill both arena <select> elements from the server-provided list
function populateArenaSelects() {
  const arenas = offlineMode ? offlineArenaList() : serverArenas;
  const options = [{ id: 'random', name: 'RANDOM', difficulty: '' }, ...arenas];
  for (const id of ['arena-select', 'solo-arena-select']) {
    const sel = document.getElementById(id);
    if (!sel) continue;
    sel.innerHTML = '';
    for (const a of options) {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.difficulty ? `${a.name} — ${a.difficulty}` : a.name;
      sel.appendChild(opt);
    }
  }
}

function buildShipGrid() {
  const grid = document.getElementById('ship-grid');
  grid.innerHTML = '';
  CONFIG.SHIPS.forEach((ship, i) => {
    const card = document.createElement('div');
    card.className = 'ship-card' + (i === myShip ? ' selected' : '');
    card.dataset.shipId = i;

    const cvs = document.createElement('canvas');
    cvs.width = 60; cvs.height = 60;
    card.appendChild(cvs);

    const name = document.createElement('div');
    name.className = 'ship-name';
    name.style.color = ship.color;
    name.textContent = ship.name;
    card.appendChild(name);

    const stats = document.createElement('div');
    stats.className = 'ship-stats';
    stats.innerHTML = `SPD ${ship.speed}<br>SHD ${ship.shield}<br>AMO ${ship.ammo}`;
    card.appendChild(stats);

    card.addEventListener('click', () => {
      myShip = i;
      net.send({ type: 'ship_select', ship: i });
      document.querySelectorAll('.ship-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });

    grid.appendChild(card);

    // Draw ship preview
    import('./ships.js').then(({ drawShipPreview }) => {
      drawShipPreview(cvs.getContext('2d'), i, 30, 30, 0);
    });
  });
}

function updateLobbyUI(lobby) {
  document.getElementById('lobby-code').textContent = lobby.code || '----';

  // Copy code on click
  const codeEl = document.getElementById('lobby-code');
  codeEl.onclick = () => navigator.clipboard?.writeText(lobby.code);

  buildShipGrid();

  const list = document.getElementById('player-list');
  list.innerHTML = '';
  (lobby.players || []).forEach(p => {
    const row = document.createElement('div');
    row.className = 'player-row' + (p.ready ? ' ready' : '');
    const shipDef = CONFIG.SHIPS[p.ship] || CONFIG.SHIPS[0];
    row.innerHTML = `
      <span class="pname" style="color:${shipDef.color}">${esc(p.name)}</span>
      <span class="pship">${shipDef.name}</span>
      <span class="pstatus">${p.id === lobby.hostId ? '(host) ' : ''}${p.ready ? 'READY' : 'not ready'}</span>
    `;
    list.appendChild(row);
  });

  // Arena picker: only the host may change it, others see the current pick
  const arenaSelect = document.getElementById('arena-select');
  if (arenaSelect) {
    arenaSelect.value = lobby.arenaId || 'random';
    arenaSelect.disabled = lobby.hostId !== myId;
  }

  // Reflect own ready state on the toggle button
  const me = (lobby.players || []).find(p => p.id === myId);
  const btnReady = document.getElementById('btn-ready');
  if (btnReady) btnReady.textContent = me?.ready ? 'UNREADY' : 'READY';
}

// Escape user-supplied text before injecting into innerHTML (anti-XSS)
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-ready')?.addEventListener('click', () => {
    // Server toggles ready/un-ready; button text updates on next lobby snapshot
    net.send({ type: 'ready' });
  });

  document.getElementById('btn-back-lobby')?.addEventListener('click', () => {
    lastJoinInfo = null;   // esci dalla room: niente rejoin automatico
    setState(STATES.MENU);
  });

  document.getElementById('arena-select')?.addEventListener('change', (e) => {
    net.send({ type: 'arena_select', arenaId: e.target.value });
  });

  document.getElementById('btn-rematch')?.addEventListener('click', () => {
    net.send({ type: 'rematch' });
    setState(STATES.LOBBY);
    if (currentRoom) updateLobbyUI(currentRoom);
  });

  // Solo screen
  setupSoloUI();
});

// ── Solo UI ───────────────────────────────────────────────────
const DIFF_HINTS = {
  easy:   '1 enemy  •  slow & inaccurate',
  medium: '2 enemies •  balanced AI',
  hard:   '3 enemies •  fast & deadly',
};

const MODE_HINTS = {
  skirmish: 'Free deathmatch vs AI — pick arena & difficulty',
  mission:  'Handcrafted objectives — complete them all',
  endless:  'Escalating waves, 3 lives — how far can you get?',
};

const MISSION_DIFF_COLORS = { easy: '#44FF44', medium: '#FFAA00', hard: '#FF4444' };

// Completed mission ids (localStorage)
const LS_MISSIONS_KEY = 'blazechase_missions';
function getCompletedMissions() {
  try { return JSON.parse(localStorage.getItem(LS_MISSIONS_KEY) || '[]'); }
  catch { return []; }
}

function buildMissionList() {
  const list = document.getElementById('mission-list');
  if (!list) return;
  list.innerHTML = '';
  const done = getCompletedMissions();
  const missions = offlineMode ? offlineMissionList() : serverMissions;

  if (missions.length === 0) {
    list.innerHTML = '<div class="diff-hint">No missions available</div>';
    return;
  }

  // Default selection: first mission
  if (!selectedMissionId || !missions.some(m => m.id === selectedMissionId)) {
    selectedMissionId = missions[0].id;
  }

  for (const m of missions) {
    const item = document.createElement('div');
    item.className = 'mission-item' + (m.id === selectedMissionId ? ' selected' : '');
    const diffColor = MISSION_DIFF_COLORS[m.difficulty] || '#888';
    item.innerHTML = `
      <span class="mission-name">${esc(m.name)}</span>
      <span class="mission-diff" style="color:${diffColor}">${esc(m.difficulty.toUpperCase())}</span>
      ${done.includes(m.id) ? '<span class="mission-done">✓</span>' : ''}
      <div class="mission-desc">${esc(m.desc)}</div>
    `;
    item.addEventListener('click', () => {
      selectedMissionId = m.id;
      list.querySelectorAll('.mission-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
    });
    list.appendChild(item);
  }
}

function selectSoloGameMode(mode) {
  soloGameMode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('selected', b.dataset.mode === mode));
  document.getElementById('mode-hint').textContent = MODE_HINTS[mode] || '';
  document.getElementById('skirmish-options')?.classList.toggle('hidden', mode !== 'skirmish');
  document.getElementById('mission-list')?.classList.toggle('hidden', mode !== 'mission');
  if (mode === 'mission') buildMissionList();
}

let selectedSoloDiff = 'easy';

function buildSoloShipGrid() {
  const grid = document.getElementById('solo-ship-grid');
  grid.innerHTML = '';
  CONFIG.SHIPS.forEach((ship, i) => {
    const card = document.createElement('div');
    card.className = 'ship-card' + (i === myShip ? ' selected' : '');
    card.dataset.shipId = i;

    const cvs = document.createElement('canvas');
    cvs.width = 60; cvs.height = 60;
    card.appendChild(cvs);

    const name = document.createElement('div');
    name.className = 'ship-name';
    name.style.color = ship.color;
    name.textContent = ship.name;
    card.appendChild(name);

    const stats = document.createElement('div');
    stats.className = 'ship-stats';
    stats.innerHTML = `SPD ${ship.speed}<br>SHD ${ship.shield}<br>AMO ${ship.ammo}`;
    card.appendChild(stats);

    card.addEventListener('click', () => {
      myShip = i;
      document.querySelectorAll('#solo-ship-grid .ship-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });

    grid.appendChild(card);
    import('./ships.js').then(({ drawShipPreview }) => {
      drawShipPreview(cvs.getContext('2d'), i, 30, 30, 0);
    });
  });
}

function setupSoloUI() {
  // Mode tabs (skirmish / mission / endless)
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => selectSoloGameMode(btn.dataset.mode));
  });
  document.getElementById('mode-hint').textContent = MODE_HINTS.skirmish;

  // Difficulty buttons (skirmish only)
  document.querySelectorAll('#skirmish-options .diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedSoloDiff = btn.dataset.diff;
      document.querySelectorAll('#skirmish-options .diff-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('diff-hint').textContent = DIFF_HINTS[selectedSoloDiff] || '';
    });
  });
  // Select easy by default
  document.getElementById('diff-easy')?.classList.add('selected');
  document.getElementById('diff-hint').textContent = DIFF_HINTS.easy;

  document.getElementById('btn-solo-play')?.addEventListener('click', () => {
    const arenaId = document.getElementById('solo-arena-select')?.value || 'random';

    // Offline mode: run the Game locally, no server involved
    if (offlineMode) {
      myName = document.getElementById('solo-name').value.trim() || 'Player';
      lastSoloDiff = selectedSoloDiff;
      soloMode = true;
      arenaData = null;
      killFeed = [];
      activePowerups = [];
      _pendingStart = true;  // handleOfflineMessage('arena') → startGame()
      try {
        offlineGame = startOfflineGame({
          mode:       soloGameMode,
          difficulty: selectedSoloDiff,
          arenaId,
          missionId:  soloGameMode === 'mission' ? selectedMissionId : undefined,
          ship:       myShip,
          name:       myName,
          onMessage:  handleOfflineMessage,
        });
      } catch (e) {
        console.error('[BLAZE] offline start error:', e);
        showMenuError('Offline game start error: ' + e.message);
        soloMode = false;
        _pendingStart = false;
        offlineGame = null;
        setState(STATES.SOLO);
        buildSoloShipGrid();
      }
      return;
    }

    if (!net.connected) { showMenuError('Not connected to server. Please wait...'); return; }
    const name = document.getElementById('solo-name').value.trim() || 'Player';
    myName = name;
    lastSoloDiff = selectedSoloDiff;
    soloMode = true;
    arenaData = null;
    killFeed = [];
    activePowerups = [];
    _pendingStart = true;  // wait for arena message
    const payload = { type: 'play_solo', name, ship: myShip, difficulty: selectedSoloDiff, arenaId, mode: soloGameMode };
    if (soloGameMode === 'mission') payload.missionId = selectedMissionId;
    if (!net.send(payload)) {
      showMenuError('Connection lost. Refresh to reconnect.');
      soloMode = false;
      _pendingStart = false;
      return;
    }
    lastSoloParams = payload;   // F5b: serve per riprendere dopo un reconnect
    // Feedback visivo: mostra countdown
    setState(STATES.COUNTDOWN);
    document.getElementById('countdown-num').textContent = '...';
    // Timeout: se arena non arriva entro 5s, torna al menu
    if (_soloTimeout) clearTimeout(_soloTimeout);
    _soloTimeout = setTimeout(() => {
      if (_pendingStart) {
        _pendingStart = false;
        soloMode = false;
        showMenuError('Server not responding. Try again.');
        setState(STATES.SOLO);
        buildSoloShipGrid();
      }
    }, 5000);
  });

  document.getElementById('btn-back-solo')?.addEventListener('click', () => {
    setState(STATES.MENU);
  });

  // Solo end screen
  document.getElementById('btn-play-again')?.addEventListener('click', () => {
    setState(STATES.SOLO);
    buildSoloShipGrid();
  });

  document.getElementById('btn-solo-end-lb')?.addEventListener('click', () => {
    setState(STATES.LEADERBOARD);
    buildLeaderboard(lastSoloDiff);
  });

  document.getElementById('btn-solo-end-menu')?.addEventListener('click', () => {
    setState(STATES.MENU);
  });

  // Leaderboard tabs
  document.querySelectorAll('.lb-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      buildLeaderboard(tab.dataset.diff);
    });
  });

  document.getElementById('btn-back-lb')?.addEventListener('click', () => {
    setState(STATES.MENU);
  });
}

// ── Leaderboard (localStorage) ───────────────────────────────
const LS_KEY = 'blazechase_scores';

function saveScore(msg) {
  if (!msg.kills && !msg.score) return;
  const all = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  all.push({
    name:       myName,
    score:      msg.score || 0,
    kills:      msg.kills || 0,
    deaths:     msg.deaths || 0,
    difficulty: msg.difficulty || 'easy',
    mode:       msg.mode || 'skirmish',
    wave:       msg.wave || null,
    victory:    !!msg.victory,
    timestamp:  Date.now(),
  });
  // Keep only last 100 entries
  if (all.length > 100) all.splice(0, all.length - 100);
  localStorage.setItem(LS_KEY, JSON.stringify(all));

  // Track completed missions
  if (msg.mode === 'mission' && msg.victory && msg.missionId) {
    const done = getCompletedMissions();
    if (!done.includes(msg.missionId)) {
      done.push(msg.missionId);
      localStorage.setItem(LS_MISSIONS_KEY, JSON.stringify(done));
    }
  }
}

function buildLeaderboard(diff) {
  const all = JSON.parse(localStorage.getItem(LS_KEY) || '[]');

  // Endless tab: its own columns (wave reached)
  const isEndless = diff === 'endless';
  document.getElementById('lb-head').innerHTML = isEndless
    ? '<tr><th>#</th><th>NAME</th><th>SCORE</th><th>WAVE</th><th>K</th><th>DATE</th></tr>'
    : '<tr><th>#</th><th>NAME</th><th>SCORE</th><th>K</th><th>D</th><th>DATE</th></tr>';

  const scores = all.filter(s => isEndless
      ? s.mode === 'endless'
      : s.mode !== 'endless' && s.difficulty === diff)
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 10);
  const tbody  = document.getElementById('lb-body');
  tbody.innerHTML = '';
  if (scores.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="6" style="text-align:center;color:#555;padding:20px">No scores yet</td>`;
    tbody.appendChild(tr);
    return;
  }
  scores.forEach((s, i) => {
    const date = new Date(s.timestamp).toLocaleDateString();
    const tr   = document.createElement('tr');
    tr.innerHTML = isEndless ? `
      <td>${i + 1}</td>
      <td>${esc(s.name)}</td>
      <td style="color:#FF6600">${s.score}</td>
      <td>${s.wave || 1}</td>
      <td>${s.kills}</td>
      <td style="color:#666;font-size:12px">${date}</td>
    ` : `
      <td>${i + 1}</td>
      <td>${esc(s.name)}${s.victory ? ' ✓' : ''}</td>
      <td style="color:#FF6600">${s.score}</td>
      <td>${s.kills}</td>
      <td>${s.deaths}</td>
      <td style="color:#666;font-size:12px">${date}</td>
    `;
    tbody.appendChild(tr);
  });
}

function showSoloEnd(msg) {
  const title  = document.getElementById('solo-end-title');
  const banner = document.getElementById('solo-end-banner');
  const stats  = document.getElementById('solo-end-stats');

  const mode = msg.mode || 'skirmish';

  if (msg.victory) {
    title.textContent  = 'VICTORY!';
    title.style.color  = '#FFD700';
    banner.textContent = mode === 'mission'
      ? `🏆 Mission complete: ${msg.missionName || ''}`
      : '🏆 All enemies defeated!';
  } else {
    title.textContent  = 'GAME OVER';
    title.style.color  = '#FF4444';
    banner.textContent = mode === 'endless' ? 'The waves got you.'
                      : mode === 'mission' ? `Mission failed: ${msg.missionName || ''}`
                      : 'You ran out of lives.';
  }

  const diffName = (msg.difficulty || 'easy').toUpperCase();
  const mm = Math.floor((msg.gameTime || 0) / 60);
  const ss = String((msg.gameTime || 0) % 60).padStart(2, '0');
  const hitPct = msg.shotsFired > 0 ? Math.round(100 * (msg.shotsHit || 0) / msg.shotsFired) : 0;
  let html = `DIFFICULTY: ${diffName}<br>`;
  if (mode === 'endless') html += `WAVE REACHED: ${msg.wave || 1}<br>`;
  html += `
    TOTAL GAME TIME: ${mm}:${ss}<br>
    SHOTS FIRED: ${msg.shotsFired || 0}<br>
    KILLS: ${msg.kills || 0}  •  DEATHS: ${msg.deaths || 0}<br>
    HIT PERCENTAGE: ${hitPct}%<br>
    SCORE: <span style="color:#FF6600;font-size:20px">${msg.score || 0}</span>
  `;
  stats.innerHTML = html;
}

// ── Game loop ─────────────────────────────────────────────────
let _pendingStart = false;
let _soloTimeout  = null;
let _fpsFrames    = 0;
let _fpsTime      = 0;

net.on('countdown', (msg) => {
  if (msg.value === 0) {
    if (arenaData) {
      startGame();
    } else {
      // Arena message hasn't arrived yet — start as soon as it does
      _pendingStart = true;
    }
  }
});

function startGame() {
  if (!arenaData) return;

  setState(STATES.PLAYING);

  const canvas = document.getElementById('game-canvas');
  const resScale = resizeCanvas(canvas);
  window.addEventListener('resize', () => resizeCanvas(canvas));

  renderer = new Renderer(canvas, arenaData, resScale);
  renderer.onNewBullet = (b) => audio.weaponFire(b.weapon);   // F9: sparo per tipo arma
  input.start();
  audio.init();

  lastFrameTime = performance.now();
  rafId = requestAnimationFrame(gameLoop);
}

function resizeCanvas(canvas) {
  const vw = CONFIG.VIEWPORT_W;
  const vh = CONFIG.VIEWPORT_H;
  const scale = Math.min(window.innerWidth / vw, window.innerHeight / vh);
  // HiDPI adattivo: parte dalla qualità salvata (impara dal PC dell'utente),
  // altrimenti 2×; il gameLoop degrada se fps < 50 e salva la scelta
  const saved = parseFloat(localStorage.getItem('blazechase_rescale') || '2');
  const resScale = Math.min(Math.max(Math.min(saved, scale), 1), 2);
  canvas.width  = Math.floor(vw * resScale);
  canvas.height = Math.floor(vh * resScale);
  canvas.style.width  = Math.floor(vw * scale) + 'px';
  canvas.style.height = Math.floor(vh * scale) + 'px';
  return resScale;
}

function gameLoop(now) {
  try {
    const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
    lastFrameTime = now;

    // Get keys
    const keys = input.get();
    input.flush();

    // Engine hum: spinta/turbo continuo (F9)
    audio.engineSet(keys.up, keys.dash);

    if (offlineGame) {
      // Offline: feed the local simulation directly (state arrives via
      // handleOfflineMessage, no interpolation needed)
      offlineGame.receiveInput(OFFLINE_PLAYER_ID, { keys });
    } else {
      // Send input to server
      net.send({ type: 'input', keys });

      // Get latest interpolated state
      const s = net.getInterpolatedState();
      if (s) gameState = s;
    }

    if (gameState && renderer) {
      // Update kill feed timers
      killFeed = killFeed.filter(k => { k.timer -= dt; return k.timer > 0; });

      // Update active powerup timers
      activePowerups = activePowerups.filter(p => { p.timer -= dt; return p.timer > 0; });

      renderer.frame(dt, gameState, myId, killFeed, activePowerups);

      // Adaptive quality: fps < 50 per ~2s → scala risoluzione 2 → 1.5 → 1
      // e la salva: la prossima partita riparte dalla qualità giusta per questo PC
      _fpsFrames++;
      _fpsTime += dt;
      if (_fpsTime >= 2) {
        const fps = _fpsFrames / _fpsTime;
        _fpsFrames = 0;
        _fpsTime = 0;
        if (fps < 50 && renderer.resScale > 1) {
          const next = renderer.resScale > 1.5 ? 1.5 : 1;
          console.log(`[BLAZE] fps ${fps.toFixed(0)} → resScale ${next}`);
          renderer.setResScale(next);
          localStorage.setItem('blazechase_rescale', String(next));
          const canvas = document.getElementById('game-canvas');
          canvas.width  = Math.floor(CONFIG.VIEWPORT_W * next);
          canvas.height = Math.floor(CONFIG.VIEWPORT_H * next);
        }
      }
    }
  } catch (e) {
    console.error('[BLAZE] gameLoop crash:', e);
    stopGameLoop();
    if (offlineGame) { stopOfflineGame(); offlineGame = null; }
    showMenuError('Game crashed: ' + e.message);
    setState(STATES.MENU);
    return;
  }

  if (state === STATES.PLAYING) {
    rafId = requestAnimationFrame(gameLoop);
  }
}

function stopGameLoop() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  input.stop();
  audio.engineSet(false, false);   // spegni l'engine hum
}

// ── Game events ───────────────────────────────────────────────
function handleGameEvent(msg) {
  if (!msg.kind) return;

  switch (msg.kind) {
    case 'explosion':
      if (renderer) renderer.fx.spawnExplosion(msg.x, msg.y, msg.size, '#FF8800');
      if (msg.size === 'large')  audio.explosionLarge();
      else if (msg.size === 'medium') audio.explosionMedium();
      else audio.explosionSmall();
      break;

    case 'kill':
      addKillFeed(msg);
      if (renderer) {
        // Large explosion already triggered separately
      }
      break;

    case 'wall_damage':
      if (renderer && arenaData) {
        arenaData.tiles[msg.ty][msg.tx] = msg.hp <= 0 ?
          CONFIG.TILE.DEBRIS : CONFIG.TILE.WALL_DEST;
        renderer.arenaRenderer.updateTile(msg.tx, msg.ty, arenaData.tiles[msg.ty][msg.tx], msg.hp);
      }
      break;

    case 'powerup_pickup':
      activePowerups.push({ ptype: msg.ptype, timer: 5 }); // show brief notification
      audio.powerupPickup();
      break;

    case 'beam':
      // Beam rendering lands in F6 — forward only if the hook exists
      if (renderer) renderer.fx.spawnBeam?.(msg);
      break;

    case 'wave_start':
      killFeed.unshift({ text: `⚑ WAVE ${msg.wave}`, color: '#FFD700', timer: 4 });
      if (killFeed.length > 3) killFeed.length = 3;
      audio.alarm();
      break;

    case 'wormhole':
      if (renderer) {
        renderer.fx.spawnExplosion(msg.fromX, msg.fromY, 'small', '#44DDFF');
        renderer.fx.spawnExplosion(msg.toX, msg.toY, 'small', '#44DDFF');
      }
      audio.wormholeSwoosh();
      break;

    case 'door':
      audio.doorClank();
      break;

    case 'button_hit':
      if (renderer) renderer.fx.spawnMuzzle(msg.x, msg.y, 0, '#FF4444');
      audio.buttonHit();
      break;
  }
}

function addKillFeed(msg) {
  // Find names from last game state
  const state = gameState;
  if (!state) return;
  const killer = state.players.find(p => p.id === msg.killerId);
  const victim = state.players.find(p => p.id === msg.victimId);
  const killerName = killer?.name || '?';
  const victimName = victim?.name || '?';
  const shipDef = killer ? CONFIG.SHIPS[killer.shipId || 0] : null;
  const color = shipDef?.color || '#FF6600';
  killFeed.unshift({ text: `${killerName} → ${victimName}`, color, timer: 4 });
  if (killFeed.length > 3) killFeed.length = 3;
}

// ── Scoreboard ────────────────────────────────────────────────
function showScoreboard(msg) {
  const winner = msg.winnerName || 'Unknown';
  document.getElementById('scoreboard-winner').textContent = `🏆 ${winner} WINS!`;
  document.getElementById('scoreboard-title').textContent = 'ROUND OVER';

  const tbody = document.getElementById('scoreboard-body');
  tbody.innerHTML = '';
  const sorted = [...msg.scores].sort((a, b) => b.kills - a.kills);
  sorted.forEach((s, i) => {
    const kd = s.deaths > 0 ? (s.kills / s.deaths).toFixed(1) : s.kills.toFixed(1);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${esc(s.name)}</td>
      <td>${s.kills}</td>
      <td>${s.deaths}</td>
      <td>${kd}</td>
    `;
    tbody.appendChild(tr);
  });
}
