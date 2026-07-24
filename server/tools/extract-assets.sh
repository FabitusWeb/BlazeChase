#!/usr/bin/env bash
# server/tools/extract-assets.sh — Estrae gli asset originali Chase Ace dai
# sheet BMP 8bpp (con permesso degli autori, v. CLAUDE.md) nei PNG usati dal
# client. Richiede ImageMagick (`convert`).
#
# Uso:  ./tools/extract-assets.sh [DIR_ASSET_ORIGINALI]
#       default: /home/coder/chaseace-original/assets
#
# Coordinate tile misurate a mano sugli sheet (griglia STATICS = 48px,
# POWERUPS = frame 20x20, EXPLODE = frame 95px). Verificare i risultati
# visivamente dopo ogni modifica.

set -euo pipefail

SRC="${1:-/home/coder/chaseace-original/assets}"
OUT="$(cd "$(dirname "$0")/../../client/assets" && pwd)"

STATICS="$SRC/Classic_set__STATICS.bmp"
POWERUPS="$SRC/statics_chz__POWERUPS.bmp"
EXPLODE="$SRC/statics_chz__EXPLODE.bmp"
STARBG="$SRC/Classic_set__STARBACKGROUND.bmp"

mkdir -p "$OUT/tiles" "$OUT/bg" "$OUT/fx" "$OUT/powerups" "$OUT/audio"

# ── WAV originali (sparo + motore per nave) ──────────────────
# Mapping navi BlazeChase → navi CA: VIPER→classic, HORNET→Lfighter,
# TITAN→hoogb4a, PHANTOM→gobel, BLAZE→martinez
wavs=(
  "viper   classic_shp"
  "hornet  Lfighter_shp"
  "titan   hoogb4a_shp"
  "phantom gobel_shp"
  "blaze   martinez_SHP"
)
for w in "${wavs[@]}"; do
  read -r ours ca <<< "$w"
  cp "$SRC/${ca}__SNDSHOOT.wav"  "$OUT/audio/shoot_${ours}.wav"
  cp "$SRC/${ca}__SNDENGINE.wav" "$OUT/audio/engine_${ours}.wav"
done

# ── Tile 48x48 da STATICS ────────────────────────────────────
# Nome                x    y   note
tiles=(
  "crate              0   96   scatola gialla metallica (LA cassa CA)"
  "crate_cracked     48    0   variante crepata per stato danneggiato"
  "wall_yellow_ca     0    0   pannello giallo con bordi hazard"
  "wall_metal        96   96   pannelli metallo grigio-blu"
)
for t in "${tiles[@]}"; do
  read -r name x y _ <<< "$t"
  convert "$STATICS" -crop 48x48+$x+$y +repage "PNG32:$OUT/tiles/$name.png"
done

# ── Sfondo stellato originale (640x480, tiled sul pavimento) ─
convert "$STARBG" "PNG32:$OUT/bg/starbackground.png"

# ── Frame esplosione blu (95x95, nero → trasparente) ─────────
# 4 frame riga 0 + 4 frame riga 1: animazione completa esplosione→detriti
i=0
for y in 0 95; do
  for x in 0 95 190 285; do
    convert "$EXPLODE" -crop 95x95+$x+$y +repage -fuzz 12% -transparent black \
      "PNG32:$OUT/fx/explode_$i.png"
    i=$((i+1))
  done
done

# ── Icone powerup (20x20, primo frame frontale di ogni riga) ─
# Le righe dello sheet sono animazioni di rotazione; il frame frontale è
# quello più leggibile come icona. Mapping righe scelto a occhio sui nostri
# 10 powerup (CONFIG.POWERUPS) — le semantica esatta dei POW CA non è
# documentata, le icone sono comunque quelle originali.
#   id effetto      riga  icona scelta
powerups=(
  "shield            0    sfera rossa/gialla"
  "pshield           1    esagono blu"
  "weapon            2    cannone arancione"
  "ammo              3    scatola grigio/gialla"
  "triple            4    tridente blu"
  "speed            10    anello arancione"
  "rapid            11    anello verde"
  "seeking          12    rotore blu/rosso"
  "double           13    boomerang grigio/giallo"
  "pshield2         14    anello rosso"
)
for p in "${powerups[@]}"; do
  read -r name row _ <<< "$p"
  y=$((row * 20))
  convert "$POWERUPS" -crop 20x20+0+$y +repage -fuzz 12% -transparent black \
    "PNG32:$OUT/powerups/$name.png"
done

# ── Sprite navi da <nave>_shp__PLAYER*.bmp ───────────────────
# Gli sheet contengono rotazioni pre-renderizzate in layout radiale non
# documentato: estraiamo il frame pulito "muso in su" (posizione relativa
# col 8/19, row 9/12 — verificata visivamente) e lo ruotiamo a runtime.
# Variante PLAYER* scelta per vicinanza al colore della nostra nave.
#   nostra nave   sheet CA       PLAYER  lato cella
mkdir -p "$OUT/ships"
ships=(
  "viper   classic_shp     1   28"   # blu
  "hornet  Lfighter_shp    4   28"   # giallo
  "titan   hoogb4a_shp     2   32"   # rosso
  "phantom gobel_shp       1   28"   # blu (niente viola nei recolor CA)
  "blaze   martinez_SHP    1   24"   # rosso/arancio
)
for s in "${ships[@]}"; do
  read -r ours ca player cs <<< "$s"
  # dimensioni sheet → griglia 19x12 celle (verificato: 532x336 @28, 496x312 @26,
  # 608x384 @32, 456x288 @24) → frame nose-up a col 8, row 9
  convert "$SRC/${ca}__PLAYER${player}.bmp" -crop ${cs}x${cs}+$((8*cs))+$((9*cs)) +repage \
    -fuzz 12% -transparent black "PNG32:$OUT/ships/${ours}.png"
done

echo "OK — asset estratti in $OUT"