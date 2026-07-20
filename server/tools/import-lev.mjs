#!/usr/bin/env node
// import-lev.mjs — decode a Chase Ace Deluxe .lev file and dump its structure.
//
// Container: CHZ_RSRC — 8B magic, 1B entry count @8, entries of 33B
// (name 25B space-padded + offset u32 LE + size u32 LE). Payload of
// "THE LEVEL" often starts 1 byte BEFORE the directory offset.
// Level data is ASCII text (CRLF): quoted section headers, a count line
// (records = count + 1; -1 = empty), then one value per line.
//
// Usage: node tools/import-lev.mjs <file.lev> [--raw]

import { readFileSync } from 'node:fs';

// Fixed-property sections: no count line, just values
const NO_COUNT = new Set(['CA LEVEL', 'CA PROPS', 'CA PROPS C', 'CA PROPS D', 'CA PROPS E']);

// Values per record for known sections (after the count line)
const ARITY = {
  'CA BLOCKS V5': 13,
  'CA HOLES V2': 8,
  'CA GIZ V3': 8,
  'CA CANS': 8,
  'CA ONEWAY V2': 6,
  'CA GRAVITY V2': 6,
  'CA HAZARDS': 5,
  'CA BGHOLES V2': 8,
  'CA REFILLINGZONES': 5,
  'CA OVERLAYS': 6,
  'CA BUILDINGS': 10,
  'CA TRIGGERS V2': 18,
  'CA TRIGGERCOLLECTORS': 17,
  'CA ENEMIES D': 8,
  'CA TURRETS B': 21,
  'CA BOXES B': 10,
  'CA POWERUPS C': 14,
  'CA BOMBS': 8,
  'CA STF CONTAINERS': 8,
  'CA DOORS': 14,
  'CA PISTONS': 18,
  'CA WORMHOLES': 6,
  'CA BGSTICKERS': 5,
  'CA CAPTURE': 5,
  'CA PLAYERZONES': 3,
};

function parseContainer(buf) {
  if (buf.subarray(0, 8).toString('latin1') !== 'CHZ_RSRC') {
    throw new Error('not a CHZ_RSRC container');
  }
  const count = buf[8];
  const entries = [];
  for (let i = 0; i < count; i++) {
    const base = 9 + i * 33;
    const name = buf.subarray(base, base + 25).toString('latin1').trimEnd();
    const offset = buf.readUInt32LE(base + 25);
    const size = buf.readUInt32LE(base + 29);
    entries.push({ name, offset, size });
  }
  return entries;
}

function extractLevelText(buf, entries) {
  const e = entries.find(x => x.name === 'THE LEVEL');
  if (!e) throw new Error('no "THE LEVEL" entry');
  // payload often starts 1 byte before the declared offset
  let start = e.offset;
  if (start > 0 && buf[start - 1] === 0x22 /* '"' */) start -= 1;
  return buf.subarray(start, e.offset + e.size).toString('latin1');
}

function parseSections(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const sections = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(/^"(CA [A-Z0-9 ]+?)"$/);
    if (m) {
      cur = { name: m[1], lines: [] };
      sections.push(cur);
    } else if (cur) {
      cur.lines.push(line);
    } else {
      // preamble (e.g. LEVELNAME/COMMENT values before any known header)
      sections.push({ name: '(preamble)', lines: [line] });
      cur = sections[sections.length - 1];
    }
  }
  return sections;
}

function unquote(s) {
  const m = s.match(/^"(.*)"$/);
  return m ? m[1] : s;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

function dump(file, raw) {
  const buf = readFileSync(file);
  const entries = parseContainer(buf);
  console.log(`=== ${file}`);
  console.log(`container entries: ${entries.map(e => `${e.name} @${e.offset}+${e.size}`).join(' | ')}`);

  const text = extractLevelText(buf, entries);
  if (raw) { console.log(text); return; }

  const sections = parseSections(text);
  for (const sec of sections) {
    const { name, lines } = sec;
    console.log(`\n--- "${name}" (${lines.length} lines)`);

    if (name === 'CA LEVELNAME' || name === 'CA COMMENT' || name === '(preamble)') {
      console.log('  ' + lines.map(unquote).join(' / '));
      continue;
    }
    if (name === 'CA FLOORTILES') {
      const [hw, ...rows] = lines;
      console.log(`  grid ${hw}: ${rows.length} rows`);
      for (const r of rows) console.log('  ' + r);
      continue;
    }
    if (name === 'CA PATHVEHICLES') {
      console.log('  ' + lines.join(' | '));
      continue;
    }
    if (NO_COUNT.has(name)) {
      console.log('  ' + lines.map(unquote).join(', '));
      continue;
    }

    const count = parseInt(lines[0], 10);
    const arity = ARITY[name];
    if (count === -1) { console.log('  (empty)'); continue; }
    const nRecords = count + 1;
    if (!arity) {
      console.log(`  count=${count} -> ${nRecords} records (arity unknown), raw:`);
      console.log('  ' + lines.slice(1).join(' | '));
      continue;
    }
    const body = lines.slice(1);
    const ok = body.length === nRecords * arity;
    console.log(`  count=${count} -> ${nRecords} records x ${arity} ${ok ? '' : `!! expected ${nRecords * arity} lines, got ${body.length}`}`);
    for (let i = 0; i < nRecords; i++) {
      const rec = body.slice(i * arity, (i + 1) * arity).map(unquote);
      console.log(`  [${i}] ${rec.join(', ')}`);
    }
  }

  // ── summary of the gameplay-relevant bits ──
  console.log('\n=== SUMMARY');
  const byName = Object.fromEntries(sections.map(s => [s.name, s.lines]));
  const recs = (n) => {
    const lines = byName[n];
    if (!lines) return [];
    const count = parseInt(lines[0], 10);
    if (count === -1) return [];
    const arity = ARITY[n];
    return Array.from({ length: count + 1 }, (_, i) =>
      lines.slice(1 + i * arity, 1 + (i + 1) * arity).map(unquote));
  };
  const level = byName['CA LEVEL'];
  if (level) console.log(`level size (screens?): ${level.join(' x ')}`);
  const propsC = byName['CA PROPS C'];
  if (propsC) console.log(`tileset: ${propsC.map(unquote).find(v => v.includes('.SET')) || '?'}`);
  for (const b of recs('CA BLOCKS V5')) {
    console.log(`block  rect(${b[0]},${b[0] && b[1]},${b[2]},${b[3]}) type=${b[4]} hp=${b[8]}`);
  }
  for (const g of recs('CA GRAVITY V2')) console.log(`gravity rect(${g[0]},${g[1]},${g[2]},${g[3]}) dir=${g[4]} force=${g[5]}`);
  for (const h of recs('CA HAZARDS')) console.log(`hazard  rect(${h[0]},${h[1]},${h[2]},${h[3]}) type=${h[4]}`);
  for (const r of recs('CA REFILLINGZONES')) console.log(`refill  rect(${r[0]},${r[1]},${r[2]},${r[3]}) type=${r[4]}`);
  for (const t of recs('CA TURRETS B')) console.log(`turret  (${t[0]},${t[1]}) type=${t[6]} rate=${t[9]} trigger=${t[13]}`);
  for (const w of recs('CA WORMHOLES')) console.log(`wormhole (${w[0]},${w[1]}) kind=${w[2]} ${w[3]},${w[4]},${w[5]}`);
  for (const p of recs('CA POWERUPS C')) console.log(`powerup (${p[0]},${p[1]}) pow=${p[2]} qty=${p[3]} respawn=${p[6]}`);
  for (const p of recs('CA PLAYERZONES')) console.log(`spawn   (${p[0]},${p[1]}) dir=${p[2]}`);
  for (const d of recs('CA DOORS')) console.log(`door    (${d[0]},${d[1]}) ${d[2]}x${d[3]} (DROPPED)`);
  for (const p of recs('CA PISTONS')) console.log(`piston  (${p[0]},${p[1]}) (DROPPED)`);
  const pv = byName['CA PATHVEHICLES'];
  if (pv && pv[0] !== '-1') console.log(`pathvehicles: ${parseInt(pv[0], 10) + 1} (DROPPED)`);
  for (const c of recs('CA CANS')) console.log(`can     (${c[0]},${c[1]}) "${c[2]}"`);
}

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error('usage: node tools/import-lev.mjs <file.lev> [--raw]');
  process.exit(1);
}
dump(file, flags.includes('--raw'));
