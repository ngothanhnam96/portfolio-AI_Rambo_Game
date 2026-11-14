/**
 * Axis-separated AABB vs. tile collision. Bodies are { x, y, w, h } with (x, y) the top-left
 * corner in pixels. Each move checks only the tiles the leading edge sweeps over, so speeds
 * below one tile per step can never tunnel.
 */

import { TILE } from "./constants.js";
import { T_HAZARD } from "./level.js";

const EPS = 1e-6;

/** Move horizontally. Returns -1 / 1 when blocked on that side, else 0. */
export function moveX(level, body, dx) {
  if (dx === 0) return 0;
  const top = Math.floor(body.y / TILE);
  const bottom = Math.floor((body.y + body.h - EPS) / TILE);
  if (dx > 0) {
    const right = body.x + body.w;
    const first = Math.floor((right - EPS) / TILE) + 1;
    const last = Math.floor((right + dx - EPS) / TILE);
    for (let col = first; col <= last; col += 1) {
      for (let row = top; row <= bottom; row += 1) {
        if (level.isSolid(col, row)) {
          body.x = col * TILE - body.w;
          return 1;
        }
      }
    }
  } else {
    const first = Math.floor(body.x / TILE) - 1;
    const last = Math.floor((body.x + dx) / TILE);
    for (let col = first; col >= last; col -= 1) {
      for (let row = top; row <= bottom; row += 1) {
        if (level.isSolid(col, row)) {
          body.x = (col + 1) * TILE;
          return -1;
        }
      }
    }
  }
  body.x += dx;
  return 0;
}

/**
 * Move vertically. Returns 1 when landing on something, -1 when bumping a ceiling, else 0.
 * Ledges only stop a body that starts above them and moves down (and not while dropping).
 */
export function moveY(level, body, dy, { ledges = true } = {}) {
  if (dy === 0) return 0;
  const left = Math.floor(body.x / TILE);
  const right = Math.floor((body.x + body.w - EPS) / TILE);
  if (dy > 0) {
    const bottom = body.y + body.h;
    const first = Math.floor((bottom - EPS) / TILE) + 1;
    const last = Math.floor((bottom + dy - EPS) / TILE);
    for (let row = first; row <= last; row += 1) {
      for (let col = left; col <= right; col += 1) {
        if (level.isSolid(col, row) || (ledges && level.isLedge(col, row))) {
          body.y = row * TILE - body.h;
          return 1;
        }
      }
    }
  } else {
    const first = Math.floor(body.y / TILE) - 1;
    const last = Math.floor((body.y + dy) / TILE);
    for (let row = first; row >= last; row -= 1) {
      if (row < 0) break; // open sky above the map
      for (let col = left; col <= right; col += 1) {
        if (level.isSolid(col, row)) {
          body.y = (row + 1) * TILE;
          return -1;
        }
      }
    }
  }
  body.y += dy;
  return 0;
}

/** Feet resting on something? `ledgesOnly` → only ledges (no solid) under the feet. */
export function standingOn(level, body, { ledgesOnly = false } = {}) {
  const row = Math.floor((body.y + body.h + 0.5) / TILE);
  if (Math.abs(row * TILE - (body.y + body.h)) > 0.5) return false;
  const left = Math.floor(body.x / TILE);
  const right = Math.floor((body.x + body.w - EPS) / TILE);
  let ledge = false;
  for (let col = left; col <= right; col += 1) {
    if (level.isSolid(col, row)) return !ledgesOnly;
    if (level.isLedge(col, row)) ledge = true;
  }
  return ledge;
}

/** Touching the deadly part (lower 10 px) of a hazard tile, or fallen out of the map? */
export function inHazard(level, body) {
  if (body.y > level.height + 8) return true;
  const left = Math.floor((body.x + 2) / TILE);
  const right = Math.floor((body.x + body.w - 2) / TILE);
  const top = Math.max(0, Math.floor(body.y / TILE));
  const bottom = Math.floor((body.y + body.h - EPS) / TILE);
  for (let row = top; row <= bottom; row += 1) {
    const deadlyTop = row * TILE + 6;
    if (body.y + body.h <= deadlyTop) continue;
    for (let col = left; col <= right; col += 1) {
      if (level.tile(col, row) === T_HAZARD) return true;
    }
  }
  return false;
}

export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export const centerX = (body) => body.x + body.w / 2;
export const centerY = (body) => body.y + body.h / 2;
