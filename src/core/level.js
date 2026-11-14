/**
 * Tile maps. Stages are authored as ASCII chunks (12 rows each) joined left → right.
 *
 *   #  solid ground          =  ledge (stand on it, jump up through it, ↓ + jump drops through)
 *   ^  hazard (stakes / electrified water / lava: instant death)
 *   @  player start          C  checkpoint          X  boss spawn          |  arena gate
 *   r  runner    R  runner squad (keeps sending runners from the right edge)
 *   g  gunner    b  bush sniper    t  wall turret    m  mortar    d  drone
 *   1–5  supply crate holding: 1 spread  2 rapid  3 laser  4 homing  5 shield
 *   p  supply pod (flies across the screen; carries the stage's next pod item)
 *
 * Entities stand on the tile below their marker: `y` is the bottom (feet) of the marker cell.
 */

import { ARENA_COLS, FLOOR_ROW, ROWS, TILE } from "./constants.js";

export const T_EMPTY = 0;
export const T_SOLID = 1;
export const T_LEDGE = 2;
export const T_HAZARD = 3;

const TILE_CHARS = { "#": T_SOLID, "=": T_LEDGE, "^": T_HAZARD };
export const ENEMY_CHARS = { r: "runner", R: "squad", g: "gunner", b: "sniper", t: "turret", m: "mortar", d: "drone", p: "pod" };
export const CRATE_CHARS = { 1: "spread", 2: "rapid", 3: "laser", 4: "homing", 5: "shield" };
const MARKERS = new Set(["@", "C", "X", "|", "."]);

/** Join chunks (arrays of ROWS equal-length strings) side by side. */
export function joinChunks(chunks) {
  const rows = Array.from({ length: ROWS }, () => "");
  chunks.forEach((chunk, index) => {
    if (chunk.length !== ROWS) throw new Error(`chunk ${index} has ${chunk.length} rows, expected ${ROWS}`);
    const width = chunk[0].length;
    chunk.forEach((line, row) => {
      if (line.length !== width) throw new Error(`chunk ${index} row ${row} is ${line.length} wide, expected ${width}`);
      rows[row] += line;
    });
  });
  return rows;
}

/** The boss arena: one open screen with a flat floor, the gate on its first column. */
export function arenaChunk() {
  return Array.from({ length: ROWS }, (_, row) => {
    if (row >= FLOOR_ROW) return "#".repeat(ARENA_COLS);
    let line = ".".repeat(ARENA_COLS);
    if (row === 0) line = "|" + line.slice(1);
    if (row === FLOOR_ROW - 1) line = line.slice(0, 14) + "X" + line.slice(15);
    return line;
  });
}

export class Level {
  constructor(rows) {
    this.rows = ROWS;
    this.cols = rows[0].length;
    this.width = this.cols * TILE;
    this.height = this.rows * TILE;
    this.grid = new Uint8Array(this.rows * this.cols);
    this.start = null;
    this.checkpoints = [];
    this.spawns = [];
    this.boss = null;
    this.gateCol = -1;

    rows.forEach((line, row) => {
      if (line.length !== this.cols) throw new Error(`row ${row} is ${line.length} wide, expected ${this.cols}`);
      [...line].forEach((ch, col) => {
        const at = { col, row, x: col * TILE + TILE / 2, y: (row + 1) * TILE };
        if (ch in TILE_CHARS) {
          this.grid[row * this.cols + col] = TILE_CHARS[ch];
        } else if (ch in ENEMY_CHARS) {
          this.spawns.push({ ...at, kind: ENEMY_CHARS[ch], id: this.spawns.length });
        } else if (ch in CRATE_CHARS) {
          this.spawns.push({ ...at, kind: "crate", item: CRATE_CHARS[ch], id: this.spawns.length });
        } else if (ch === "@") {
          this.start = at;
        } else if (ch === "C") {
          this.checkpoints.push(at);
        } else if (ch === "X") {
          this.boss = at;
        } else if (ch === "|") {
          this.gateCol = col;
        } else if (!MARKERS.has(ch)) {
          throw new Error(`unknown tile '${ch}' at ${col},${row}`);
        }
      });
    });
    this.checkpoints.sort((a, b) => a.x - b.x);
    this.spawns.sort((a, b) => a.x - b.x || a.id - b.id);
  }

  /** Outside the map: walls left/right and above, open pit below. */
  tile(col, row) {
    if (col < 0 || col >= this.cols || row < 0) return T_SOLID;
    if (row >= this.rows) return T_EMPTY;
    return this.grid[row * this.cols + col];
  }

  isSolid(col, row) {
    return this.tile(col, row) === T_SOLID;
  }

  isLedge(col, row) {
    return this.tile(col, row) === T_LEDGE;
  }

  /** Left edge (px) of the boss arena; the camera stops here and locks once it arrives. */
  get arenaX() {
    return this.gateCol * TILE;
  }

  /** Top row of the first safe floor in `col` (solid or ledge with no hazard above), or -1. */
  floorRow(col) {
    for (let row = 1; row < this.rows; row += 1) {
      const t = this.tile(col, row);
      if (t === T_HAZARD) return -1;
      if (t === T_SOLID || t === T_LEDGE) return this.tile(col, row - 1) === T_EMPTY ? row : -1;
    }
    return -1;
  }
}
