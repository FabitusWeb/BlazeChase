#!/usr/bin/env node
// lev2arena.mjs — converte un .lev Chase Ace Deluxe in una mappa ASCII 40x30
// pronta per LAYOUTS di server/src/arenas.js.
//
// Cosa converte: BLOCKS V5 (type 14 → '#' solido, altri con hp>0 → 'D'
// distruttibile), PLAYERZONES → 'S', REFILLINGZONES → 'R', TURRETS → 'T'/'O',
// WORMHOLES → '1'/'2', DOORS → '3', PISTONS → 'Z', ONEWAY → u/j/h/k,
// GRAVITY → frecce. GIZ/OVERLAYS/STICKERS (decorazioni) scartati.
// Regole post: bordo '#'; righe/colonne di D>4 diventano '#' (casse sparse
// come in CA); esattamente 4 'S'; almeno 4 'P' sparse se il livello non ne ha.
//
// Uso: node tools/lev2arena.mjs <file.lev> [id] [theme]
//
// NOTE / INCERTEZZE (formato non documentato):
// - tipo blocco 14 = frame solido (verificato su hole in one: il bordo).
// - direzioni gravity/oneway/torrette mappate per euristica — vanno
//   verificate in gioco e ritoccate a mano se stonate.

import { readFileSync } from 'node:fs';

const [, , file, argId, argTheme] = process.argv;
if (!file) { console.error('uso: node tools/lev2arena.mjs <file.lev> [id] [theme]'); process.exit(1); }

// ── Container CHZ_RSRC (come import-lev.mjs) ─────────────────
const buf = readFileSync(file);
const magic = buf.subarray(0, 8).toString('latin1').replace(/\0/g, '');
if (!magic.startsWith('CHZ_RSR')) throw new Error(`magic sconosciuto: ${magic}`);
const count = buf.readUInt8(8);
let levelText = null;
for (let i = 0; i < count; i++) {
  const off = 9 + i * 33;
  const name = buf.subarray(off, off + 25).toString('latin1').trim();
  const ofs  = buf.readUInt32LE(off + 25);
  const size = buf.readUInt32LE(off + 29);
  if (name === 'THE LEVEL') {
    // payload spesso a ofs-1
    let start = ofs;
    if (buf[ofs - 1] === 0x22 || buf[ofs] !== 0x22) start = ofs - 1;
    levelText = buf.subarray(start, ofs + size).toString('latin1');
  }
}
if (!levelText) throw new Error('THE LEVEL non trovato');

// ── Parser sezioni (headers quotati + count line) ────────────
const NO_COUNT = new Set(['CA LEVEL', 'CA PROPS', 'CA PROPS C', 'CA PROPS D', 'CA PROPS E']);
const lines = levelText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
const sections = {};
{
  let cur = null, expectCount = false;
  for (const line of lines) {
    const hdr = line.match(/^"(.+)"$/);
    if (hdr) { cur = hdr[1]; sections[cur] = []; expectCount = !NO_COUNT.has(cur); continue; }
    if (!cur) continue;
    if (expectCount) { sections[cur]._count = parseInt(line, 10); expectCount = false; continue; }
    sections[cur].push(line);
  }
}
const records = (name, arity) => {
  const sec = sections[name];
  if (!sec || sec._count === -1 || sec._count === undefined) return [];
  const n = sec._count + 1;
  const vals = sec.slice(0, n * arity).map(v => {
    const num = Number(v);
    return Number.isNaN(num) ? v.replace(/^"|"$/g, '') : num;
  });
  const out = [];
  for (let i = 0; i + arity <= vals.length; i += arity) out.push(vals.slice(i, i + arity));
  return out;
};

// ── Sezioni rilevanti ────────────────────────────────────────
const blocks   = records('CA BLOCKS V5', 13);
const spawns   = records('CA PLAYERZONES', 3);
const refills  = records('CA REFILLINGZONES', 5);
const gravity  = records('CA GRAVITY V2', 6);
const turrets  = records('CA TURRETS B', 21);
const wormholes = records('CA WORMHOLES', 6);
const doors    = records('CA DOORS', 14);
const pistons  = records('CA PISTONS', 18);
const oneways  = records('CA ONEWAY V2', 6);
const powerups = records('CA POWERUPS C', 14);

if (blocks.length === 0) throw new Error('nessun blocco: livello vuoto?');

// ── Bounding box dei contenuti ───────────────────────────────
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const [x1, y1, x2, y2] of blocks) {
  minX = Math.min(minX, x1); minY = Math.min(minY, y1);
  maxX = Math.max(maxX, x2); maxY = Math.max(maxY, y2);
}
const COLS = 40, ROWS = 30, BORDER = 1;
const innerW = COLS - 2 * BORDER, innerH = ROWS - 2 * BORDER;
// Scala NATURALE: 1 tile CA (48px) = 1 tile nostro (40px). Niente squish a
// riempire la griglia: le mappe CA sono percorsi che galleggiano nello
// spazio, con margini di starfield intorno (fix feedback playtest).
// Si riduce sotto 1:1 solo se il livello è più grande della griglia.
const scale = Math.min(innerW / (maxX - minX), innerH / (maxY - minY), 1 / 48);
const offX = BORDER + (innerW - (maxX - minX) * scale) / 2;
const offY = BORDER + (innerH - (maxY - minY) * scale) / 2;
const toCell = (px, py) => [
  Math.round(offX + (px - minX) * scale),
  Math.round(offY + (py - minY) * scale),
];

// ── Rasterizzazione ──────────────────────────────────────────
const grid = Array.from({ length: ROWS }, () => Array(COLS).fill('.'));
const put = (cx, cy, ch) => {
  if (cy >= 1 && cy < ROWS - 1 && cx >= 1 && cx < COLS - 1) grid[cy][cx] = ch;
};

for (const [x1, y1, x2, y2, type, , , , hp] of blocks) {
  const ch = type === 14 ? '#' : (hp > 0 ? 'D' : '#');
  const [c1, r1] = toCell(x1, y1);
  const [c2, r2] = toCell(x2, y2);
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++)
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++)
      put(c, r, ch);
}

// Regola CA: file di D più lunghe di 4 diventano muro solido (casse sparse)
for (let r = 0; r < ROWS; r++) {
  let run = 0;
  for (let c = 0; c <= COLS; c++) {
    if (c < COLS && grid[r][c] === 'D') { run++; continue; }
    if (run > 4) for (let k = c - run; k < c; k++) grid[r][k] = '#';
    run = 0;
  }
}
for (let c = 0; c < COLS; c++) {
  let run = 0;
  for (let r = 0; r <= ROWS; r++) {
    if (r < ROWS && grid[r][c] === 'D') { run++; continue; }
    if (run > 4) for (let k = r - run; k < r; k++) grid[k][c] = '#';
    run = 0;
  }
}

// Bordo PRIMA del flood-fill: altrimenti il bordo aperto collega le sacche
// esterne al frame e il flood le considera raggiungibili (bug t1,1)
for (let c = 0; c < COLS; c++) { grid[0][c] = '#'; grid[ROWS - 1][c] = '#'; }
for (let r = 0; r < ROWS; r++) { grid[r][0] = '#'; grid[r][COLS - 1] = '#'; }

// Regioni irraggiungibili → muro: il frame CA scalato dentro la griglia
// lascia anelli di pavimento chiusi tra bordo e frame. Flood-fill dal '.'
// più vicino al centro (D calpestabile, come nei test) PRIMA di piazzare
// feature e spawn: tutto ciò che non è raggiunto diventa '#'.
{
  const passable = (ch) => ch !== '#';
  let seed = null;
  outer: for (let rad = 0; rad < 20; rad++)
    for (let dr = -rad; dr <= rad; dr++)
      for (let dc = -rad; dc <= rad; dc++) {
        const c = 20 + dc, r = 15 + dr;
        if (grid[r]?.[c] === '.') { seed = [c, r]; break outer; }
      }
  const seen = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const q = seed ? [seed] : [];
  if (seed) seen[seed[1]][seed[0]] = true;
  while (q.length) {
    const [c, r] = q.pop();
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (seen[nr][nc] || !passable(grid[nr][nc])) continue;
      seen[nr][nc] = true;
      q.push([nc, nr]);
    }
  }
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (!seen[r][c]) grid[r][c] = '#';
}

// Feature (centro del record) — piazzate SOLO su pavimento '.': il centro
// di un record può cadere dentro un muro; in tal caso cerca il '.' più
// vicino (raggio 4), altrimenti scarta la feature.
const center = (rec) => toCell((rec[0] + rec[2]) / 2, (rec[1] + rec[3]) / 2);
const putFloor = (c, r, ch) => {
  if (grid[r]?.[c] === '.') { grid[r][c] = ch; return true; }
  for (let rad = 1; rad <= 4; rad++)
    for (let dr = -rad; dr <= rad; dr++)
      for (let dc = -rad; dc <= rad; dc++)
        if (grid[r + dr]?.[c + dc] === '.') { grid[r + dr][c + dc] = ch; return true; }
  return false;
};
for (const t of turrets)  { const [c, r] = toCell(t[0], t[1]); putFloor(c, r, t[6] === 172 ? 'O' : 'T'); }
for (const g of gravity)  { const [c, r] = center(g); putFloor(c, r, { 0: '>', 2: '<', 4: '^', 6: 'v' }[g[4]] || '>'); }
for (const d of doors)    { const [c, r] = toCell(d[0], d[1]); putFloor(c, r, '3'); }
// Le porte servono un bottone (gruppo 3 ↔ 'b'), altrimenti restano chiuse
// per sempre: piazza un 'b' sul pavimento libero più vicino alla prima porta
if (doors.length > 0) {
  const [dc, dr] = toCell(doors[0][0], doors[0][1]);
  putFloor(dc + 2, dr, 'b') || putFloor(dc, dr + 2, 'b') || putFloor(dc - 2, dr, 'b');
}
for (const p of pistons)  { const [c, r] = toCell(p[0], p[1]); putFloor(c, r, 'Z'); }
for (const o of oneways)  { const [c, r] = center(o); putFloor(c, r, { 1: 'u', 2: 'k', 3: 'j', 4: 'h' }[o[4]] || 'u'); }
for (const rf of refills) { const [c, r] = center(rf); putFloor(c, r, 'R'); }
for (const p of powerups) { const [c, r] = toCell(p[0], p[1]); putFloor(c, r, 'P'); }
// Wormholes a coppie: in ordine, 2 a 2 → gruppo '1' poi '2'
wormholes.forEach((w, i) => { const [c, r] = toCell(w[0], w[1]); putFloor(c, r, i < 2 ? '1' : '2'); });

// Spawn: esattamente 4 — prendi i playerzones (o gli angoli se mancano).
// Piazzamento con 3x3 libero: solo celle che il parser renderà come FLOOR
// ('.', 'S', 'P' e le feature che restano FLOOR), niente muri/casse/refuel.
const FLOOR_OK = new Set(['.', 'P', 'M', 'T', 'O', 'B', '<', '>', '^', 'v', '1', '2', 'b', 'n', 'Z']);
// NOTA: 'S' escluso apposta — così due spawn non collassano sulla stessa cella
const isClear33 = (c, r) => {
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const ch = grid[r + dr]?.[c + dc];
      if (ch === undefined || !FLOOR_OK.has(ch)) return false;
    }
  return true;
};
const nearestClear = (c, r) => {
  for (let rad = 0; rad < 12; rad++)
    for (let dr = -rad; dr <= rad; dr++)
      for (let dc = -rad; dc <= rad; dc++)
        if (isClear33(c + dc, r + dr)) return [c + dc, r + dr];
  // Fallback: scansione globale, la cella libera più vicina in assoluto
  let best = null, bestD = Infinity;
  for (let rr = 1; rr < ROWS - 1; rr++)
    for (let cc = 1; cc < COLS - 1; cc++)
      if (isClear33(cc, rr)) {
        const d = (cc - c) ** 2 + (rr - r) ** 2;
        if (d < bestD) { bestD = d; best = [cc, rr]; }
      }
  if (best) return best;
  // Ultima spiaggia: qualunque cella '.' dal centro in fuori (sempre interna)
  for (let rad = 0; rad < 20; rad++)
    for (let dr = -rad; dr <= rad; dr++)
      for (let dc = -rad; dc <= rad; dc++)
        if (grid[15 + dr]?.[20 + dc] === '.') return [20 + dc, 15 + dr];
  return [3, 3];
};
const spawnCells = spawns.slice(0, 4).map(s => toCell(s[0], s[1]));
while (spawnCells.length < 4) {
  spawnCells.push([[3, 3], [COLS - 4, 3], [3, ROWS - 4], [COLS - 4, ROWS - 4]][spawnCells.length]);
}
// Piazzamento INCREMENTALE: ogni nearestClear vede gli 'S' già scritti,
// così due spawn non collassano sulla stessa cella o adiacenti
const placedSpawns = [];
for (const [c, r] of spawnCells) {
  const [bc, br] = nearestClear(c, r);
  put(bc, br, 'S');
  placedSpawns.push([bc, br]);
}

// Almeno 4 powerup spot su pavimento aperto
let pCount = grid.flat().filter(ch => ch === 'P').length;
for (let tries = 0; pCount < 4 && tries < 500; tries++) {
  const c = 2 + Math.floor(Math.random() * (COLS - 4));
  const r = 2 + Math.floor(Math.random() * (ROWS - 4));
  if (grid[r][c] === '.') { grid[r][c] = 'P'; pCount++; }
}

// ── Output ───────────────────────────────────────────────────
const slug = (argId || sections['CA LEVELNAME']?.[0] || 'level')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const name = (sections['CA LEVELNAME']?.[0] || slug).toUpperCase();
console.log(`  {`);
console.log(`    id: '${slug}',`);
console.log(`    name: '${name}',`);
console.log(`    difficulty: 'MEDIUM',`);
console.log(`    theme: '${argTheme || 'INDUSTRIAL'}',`);
console.log(`    map: [`);
for (const row of grid) console.log(`      '${row.join('')}',`);
console.log(`    ],`);
console.log(`  },`);
console.error(`[lev2arena] ${file} → '${slug}' | blocchi ${blocks.length} | spawn ${spawnCells.length}→${placedSpawns.map(s => s.join(',')).join(' ')} | torrette ${turrets.length} | porte ${doors.length} | pistoni ${pistons.length} | gravity ${gravity.length} | wormhole ${wormholes.length}`);
