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
  SHIP_ACCEL:     900,   // snappy CA-style acceleration (was 500: troppo molle)
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
    { id: 0, name: 'VIPER',   color: '#00DDFF', accent: '#0088AA', speed: 320, turn: 5.5, shield: 100, ammo: 200 },
    { id: 1, name: 'HORNET',  color: '#FFCC00', accent: '#AA8800', speed: 390, turn: 6.5, shield:  70, ammo: 150 },
    { id: 2, name: 'TITAN',   color: '#FF4444', accent: '#AA1111', speed: 250, turn: 4.0, shield: 150, ammo: 300 },
    { id: 3, name: 'PHANTOM', color: '#AA44FF', accent: '#6611AA', speed: 345, turn: 5.8, shield:  80, ammo: 250 },
    { id: 4, name: 'BLAZE',   color: '#FF6600', accent: '#AA3300', speed: 355, turn: 5.2, shield:  90, ammo: 180 },
  ],

  // ── Weapons ──────────────────────────────────────────────
  // fireRate=s between shots, ammoCost per shot, damage per bullet, speed px/s
  // pickupAmmo: ammo granted by the WEAPON powerup; -1 ammo in inventory = infinite
  // aoe: {radius, damage} explodes on impact; beam: hitscan {length}; lay: 'mine'
  WEAPONS: [
    { id: 0,  name: 'BLASTER',      color: '#FFFF44', fireRate: 0.15, ammoCost: 1, damage: 8,  speed: 620, size: 4,  count: 1, spread: 0,    homing: false, infinite: true },
    { id: 1,  name: 'DOUBLE',       color: '#44FFFF', fireRate: 0.18, ammoCost: 2, damage: 7,  speed: 570, size: 4,  count: 2, spread: 0,    homing: false, pickupAmmo: 100 },
    { id: 2,  name: 'SPREAD',       color: '#44FF44', fireRate: 0.25, ammoCost: 3, damage: 6,  speed: 520, size: 3,  count: 3, spread: 0.26, homing: false, pickupAmmo: 90  },
    { id: 3,  name: 'MISSILE',      color: '#FF8800', fireRate: 0.60, ammoCost: 1, damage: 30, speed: 360, size: 8,  count: 1, spread: 0,    homing: true,  pickupAmmo: 12  },
    { id: 4,  name: 'MACHINE GUN',  color: '#FF44AA', fireRate: 0.07, ammoCost: 1, damage: 4,  speed: 720, size: 3,  count: 1, spread: 0.05, homing: false, pickupAmmo: 300 },
    { id: 5,  name: 'PLASMA',       color: '#BB44FF', fireRate: 0.40, ammoCost: 5, damage: 20, speed: 460, size: 10, count: 1, spread: 0,    homing: false, pickupAmmo: 40  },
    { id: 6,  name: 'MORTAR',       color: '#FFAA33', fireRate: 0.50, ammoCost: 1, damage: 12, speed: 420, size: 6,  count: 1, spread: 0,    homing: false, aoe: { radius: 60,  damage: 25 }, pickupAmmo: 20 },
    { id: 7,  name: 'MACRO MORTAR', color: '#FF5522', fireRate: 0.90, ammoCost: 1, damage: 20, speed: 520, size: 9,  count: 1, spread: 0,    homing: false, aoe: { radius: 110, damage: 50 }, pickupAmmo: 8  },
    { id: 8,  name: 'CHARGE ROCKET',color: '#FFDD66', fireRate: 0.45, ammoCost: 1, damage: 10, speed: 380, size: 5,  count: 1, spread: 0.12, homing: false, erratic: true, aoe: { radius: 50, damage: 20 }, pickupAmmo: 24 },
    { id: 9,  name: 'LASER CANNON', color: '#FF2222', fireRate: 0.10, ammoCost: 2, damage: 6,  speed: 0,   size: 3,  count: 1, spread: 0,    homing: false, beam: { length: 420 }, pickupAmmo: 120 },
    { id: 10, name: 'MINES',        color: '#CCCCCC', fireRate: 0.60, ammoCost: 1, damage: 0,  speed: 0,   size: 6,  count: 1, spread: 0,    homing: false, lay: 'mine', pickupAmmo: 10 },
  ],

  // ── Mines (laid by weapon 10) ─────────────────────────────
  MINE: {
    TRIGGER_RADIUS: 50,   // proximity trigger (any ship, owner included)
    AOE_RADIUS:     70,
    AOE_DAMAGE:     35,
    ARM_TIME:       0.8,  // seconds before the mine becomes live
    MAX_PER_SHIP:   5,    // oldest mine is dropped beyond this
  },

  // ── Environmental hazards (arena-placed) ──────────────────
  HAZARDS: {
    TURRET_MISSILE: { HP: 60, RANGE: 420, FIRE_RATE: 1.6, BULLET_SPEED: 300, DAMAGE: 18, HOMING: true },
    TURRET_MORTAR:  { HP: 60, RANGE: 380, FIRE_RATE: 2.4, BULLET_SPEED: 260, DAMAGE: 10, AOE: { radius: 55, damage: 20 } },
    BLACKHOLE: { PULL_RADIUS: 220, PULL_FORCE: 260, DAMAGE_RADIUS: 34, DPS: 25 },
    WAVE: { INTERVAL: 18, SPEED: 140, WIDTH: 60, DAMAGE: 20, PUSH: 320 },
  },

  // ── Power-ups ─────────────────────────────────────────────
  POWERUPS: [
    { id: 0, name: 'SHIELD',   color: '#00AAFF', icon: 'S', effect: 'shield',     value: 30 },
    { id: 1, name: 'AMMO',     color: '#FFAA00', icon: 'A', effect: 'ammo',       value: 60 },
    { id: 2, name: 'WEAPON',   color: '#FF44FF', icon: 'W', effect: 'weapon',     value: 0  },
    { id: 3, name: 'PSHIELD',  color: '#4444FF', icon: 'P', effect: 'pshield',    value: 1  }, // absorb pool = 1× ship max shield
    { id: 4, name: 'SPEED',    color: '#44FF44', icon: 'V', effect: 'speed',      value: 5  }, // 5s duration
    { id: 5, name: 'SEEKING',  color: '#FF0066', icon: 'H', effect: 'seeking',    value: 10 }, // 10s duration
    { id: 6, name: 'DOUBLE',   color: '#44FFFF', icon: 'D', effect: 'doubleshot', value: 10 }, // 10s duration
    { id: 7, name: 'TRIPLE',   color: '#44FF44', icon: 'T', effect: 'tripleshot', value: 10 }, // 10s duration
    { id: 8, name: 'RAPID',    color: '#FF44AA', icon: 'R', effect: 'rapidfire',  value: 10 }, // 10s duration
    { id: 9, name: 'PSHIELD2', color: '#2222CC', icon: 'Q', effect: 'pshield2',   value: 2  }, // absorb pool = 2× ship max shield
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
