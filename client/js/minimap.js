// client/js/minimap.js — Thumbnail del layout arena nel picker (F12)
// Usa le mappe ASCII dei layout (le stesse del sim offline): i muri sono
// la struttura portante, le feature (spawn/powerup/hazard) diventano puntini.

import { LAYOUTS } from './sim/arenas.js';

// Colori stile CA: acciaio per i muri, giallo mattoni per i distruttibili
const TILE_COLORS = {
  '#': '#7a8aa0',   // WALL_SOLID — acciaio blu-grigio
  'D': '#c8a820',   // WALL_DEST  — mattoni gialli CA
  'G': '#3a6a7a',   // vetro
  'A': '#2a7a1a',   // acido
  'R': '#2a4a9a',   // refuel zone
  '3': '#3a9a4a',   // porte gruppo 3
  '4': '#3a9a4a',   // porte gruppo 4
  'u': '#4a6a9a', 'j': '#4a6a9a', 'h': '#4a6a9a', 'k': '#4a6a9a', // one-way
};

// Feature su pavimento: disegnate come puntini sopra il tile
const FEATURE_COLORS = {
  'S': '#e8ecff',   // spawn
  'P': '#FF44FF',   // powerup spot
  'M': '#FF4444',   // mina
  'T': '#FF8822',   // torretta missile
  'O': '#FFAA33',   // torretta mortaio
  'B': '#AA44FF',   // buco nero
  '<': '#44DDFF', '>': '#44DDFF', '^': '#44DDFF', 'v': '#44DDFF', // gravity
  '1': '#BB66FF', '2': '#BB66FF', // wormholes
  'b': '#FF3333', 'n': '#FF3333', // bottoni trigger
  'Z': '#FFCC00',                 // pistone
};

/**
 * Disegna la minimappa di un'arena in una canvas.
 * arenaId 'random' o sconosciuto → punto interrogativo stile CA.
 */
export function drawArenaMinimap(canvas, arenaId) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#060a1c';
  ctx.fillRect(0, 0, W, H);

  const layout = LAYOUTS.find(l => l.id === arenaId);
  if (!layout) {
    // Arena casuale/procedurale: nessuna anteprima possibile
    ctx.fillStyle = '#FFCC00';
    ctx.font = `bold ${Math.floor(H * 0.6)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', W / 2, H / 2);
    return;
  }

  const rows = layout.map.length;
  const cols = layout.map[0].length;
  const ts = Math.min(W / cols, H / rows);   // pixel per tile
  const ox = (W - cols * ts) / 2;
  const oy = (H - rows * ts) / 2;

  for (let y = 0; y < rows; y++) {
    const row = layout.map[y];
    for (let x = 0; x < cols; x++) {
      const ch = row[x];
      const tileColor = TILE_COLORS[ch];
      if (tileColor) {
        ctx.fillStyle = tileColor;
        ctx.fillRect(ox + x * ts, oy + y * ts, ts + 0.5, ts + 0.5);
      }
      const featColor = FEATURE_COLORS[ch];
      if (featColor) {
        ctx.fillStyle = featColor;
        const r = Math.max(1.2, ts * 0.38);
        ctx.beginPath();
        ctx.arc(ox + (x + 0.5) * ts, oy + (y + 0.5) * ts, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
