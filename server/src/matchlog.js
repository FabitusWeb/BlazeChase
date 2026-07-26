// server/src/matchlog.js — Match log append-only (F15b)
// Una riga JSON per partita in logs/matches.jsonl: lettura post-playtest
// via endpoint GET /logs/matches.jsonl (vedi index.js). Mai bloccante.

'use strict';

const fs   = require('fs');
const path = require('path');

const DIR  = path.join(__dirname, '..', 'logs');
const FILE = path.join(DIR, 'matches.jsonl');

function logMatch(entry) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.appendFileSync(FILE, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
  } catch (e) {
    console.warn('[matchlog] scrittura fallita:', e.message);
  }
}

module.exports = { logMatch, FILE };
