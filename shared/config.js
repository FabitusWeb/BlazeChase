// shared/config.js — single source of truth for all game constants
// CommonJS (used by server directly, client gets a copy as window.CONFIG)

const CONFIG = {
  // ── Network ──────────────────────────────────────────────
  WS_PORT: 3080,
  TICK_RATE: 60,
  STATE_INTERVAL: 3,       // broadcast state every N ticks → 20 Hz
  INTERP_DELAY: 100,       // ms client interpolation buffer
  HEARTBEAT_INTERVAL: 5000,
  HEARTBEAT_TIMEOUT: 15000,

  // ── World ─────────────────────────────────────────────────
  TILE_SIZE: 40,
  ARENA_COLS: 40,
  ARENA_ROWS: 30,
  ARENA_WIDTH:  40 * 40,   // TILE_SIZE * ARENA_COLS = 1600
  ARENA_HEIGHT: 40 * 30,   // TILE_SIZE * ARENA_ROWS = 1200
  VIEWPORT_W: 800,
  VIEWPORT_H: 600,

  // ── Tile types ────────────────────────────────────────────
  TILE: {
    FLOOR:       0,
    WALL_SOLID:  1,
    WALL_DEST:   2,
    ACID:        3,
    REFUEL:      4,
    GLASS:       5,
    DEBRIS:      6,
  },
  WALL_DEST_HP: 30,
  GLASS_HP:     15,

  // ── Ship physics (base — per-ship modifiers applied on top) ─
  SHIP_RADIUS:    14,
  SHIP_ACCEL:     500,
  SHIP_FRICTION:  0.87,    // velocity multiplier per tick (dt-adjusted)
  DASH_SPEED:     650,
  DASH_DURATION:  0.14,
  DASH_COOLDOWN:  1.5,
  DODGE_SPEED:    500,
  DODGE_DURATION: 0.22,
  DODGE_INVULN:   0.30,
  DODGE_COOLDOWN: 2.0,

  // ── Respawn ───────────────────────────────────────────────
  RESPAWN_TIME:   2.0,
  RESPAWN_INVULN: 2.0,

  // ── Environment ───────────────────────────────────────────
  ACID_DAMAGE:       15,   // hp/s
  ACID_SLOW:         0.5,  // speed multiplier
  REFUEL_SHIELD_RATE: 30,  // hp/s
  REFUEL_AMMO_RATE:   50,  // ammo/s

  // ── Deathmatch ────────────────────────────────────────────
  KILL_TARGET: 10,

  // ── Ships ─────────────────────────────────────────────────
  // speed=px/s maxSpeed, turn=rad/s, shield=max HP, ammo=max ammo
  SHIPS: [
    { id: 0, name: 'VIPER',   color: '#00DDFF', accent: '#0088AA', speed: 280, turn: 5.5, shield: 100, ammo: 200 },
    { id: 1, name: 'HORNET',  color: '#FFCC00', accent: '#AA8800', speed: 340, turn: 6.5, shield:  70, ammo: 150 },
    { id: 2, name: 'TITAN',   color: '#FF4444', accent: '#AA1111', speed: 220, turn: 4.0, shield: 150, ammo: 300 },
    { id: 3, name: 'PHANTOM', color: '#AA44FF', accent: '#6611AA', speed: 300, turn: 5.8, shield:  80, ammo: 250 },
    { id: 4, name: 'BLAZE',   color: '#FF6600', accent: '#AA3300', speed: 310, turn: 5.2, shield:  90, ammo: 180 },
  ],

  // ── Weapons ──────────────────────────────────────────────
  // fireRate=s between shots, ammoCost per shot, damage per bullet, speed px/s
  WEAPONS: [
    { id: 0, name: 'BLASTER', color: '#FFFF44', fireRate: 0.15, ammoCost: 1,  damage: 8,  speed: 620, size: 4,  count: 1, spread: 0,    homing: false },
    { id: 1, name: 'DOUBLE',  color: '#44FFFF', fireRate: 0.18, ammoCost: 2,  damage: 7,  speed: 570, size: 4,  count: 2, spread: 0,    homing: false },
    { id: 2, name: 'SPREAD',  color: '#44FF44', fireRate: 0.25, ammoCost: 3,  damage: 6,  speed: 520, size: 3,  count: 3, spread: 0.26, homing: false },
    { id: 3, name: 'MISSILE', color: '#FF8800', fireRate: 0.60, ammoCost: 8,  damage: 30, speed: 360, size: 8,  count: 1, spread: 0,    homing: true  },
    { id: 4, name: 'RAPID',   color: '#FF44AA', fireRate: 0.07, ammoCost: 1,  damage: 4,  speed: 720, size: 3,  count: 1, spread: 0.05, homing: false },
    { id: 5, name: 'PLASMA',  color: '#BB44FF', fireRate: 0.40, ammoCost: 5,  damage: 20, speed: 460, size: 10, count: 1, spread: 0,    homing: false },
  ],

  // ── Power-ups ─────────────────────────────────────────────
  POWERUPS: [
    { id: 0, name: 'SHIELD',   color: '#00AAFF', icon: 'S', effect: 'shield',   value: 30  },
    { id: 1, name: 'AMMO',     color: '#FFAA00', icon: 'A', effect: 'ammo',     value: 60  },
    { id: 2, name: 'WEAPON',   color: '#FF44FF', icon: 'W', effect: 'weapon',   value: 0   },
    { id: 3, name: 'PSHIELD',  color: '#4444FF', icon: 'P', effect: 'pshield',  value: 8   }, // 8s duration
    { id: 4, name: 'SPEED',    color: '#44FF44', icon: 'V', effect: 'speed',    value: 5   }, // 5s duration
  ],
  POWERUP_LIFETIME:    15,   // seconds before disappearing
  POWERUP_RESPAWN:     20,   // seconds between spawns at fixed spots
  POWERUP_DROP_CHANCE: 0.35, // when enemy/wall is destroyed

  // ── Arena themes ─────────────────────────────────────────
  THEMES: {
    INDUSTRIAL: { floor: '#7a6648', wall: '#3a3a48', wallDest: '#6a4a30', accent: '#FFD700', acid: '#2a5a1a', refuel: '#1a2a5a' },
    DESERT:     { floor: '#c2a66b', wall: '#7a5a1a', wallDest: '#8a5a2a', accent: '#FF6B35', acid: '#2a5a1a', refuel: '#1a2a5a' },
    TOXIC:      { floor: '#4a5a3a', wall: '#2a2a2a', wallDest: '#3a3a2a', accent: '#88FF44', acid: '#1a3a0a', refuel: '#0a1a3a' },
    ICE:        { floor: '#8ab4c4', wall: '#4a6a84', wallDest: '#5a7a90', accent: '#00DDFF', acid: '#1a5a1a', refuel: '#1a3a6a' },
    LAVA:       { floor: '#4a2a10', wall: '#1a0a00', wallDest: '#3a1a08', accent: '#FF4400', acid: '#1a3a0a', refuel: '#0a1a3a' },
  },
  THEME_NAMES: ['INDUSTRIAL', 'DESERT', 'TOXIC', 'ICE', 'LAVA'],

  // ── Bullet lifetime ────────────────────────────────────────
  BULLET_LIFETIME: 3.0,  // seconds
};

// Works in both Node (CommonJS) and browser (window.CONFIG set via script tag)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
} else if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}
