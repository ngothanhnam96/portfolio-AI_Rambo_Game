/** Shared helpers for the test suites. */

import { DT } from "../../src/core/constants.js";
import { Level } from "../../src/core/level.js";
import { NO_INPUT, Player } from "../../src/core/player.js";

export const idle = NO_INPUT;

export function press(overrides) {
  return { ...idle, ...overrides };
}

/** A small hand-drawn level; rows are padded to 12 with empty rows on top. */
export function levelFrom(rows) {
  const width = rows[0].length;
  const padded = [...Array.from({ length: 12 - rows.length }, () => ".".repeat(width)), ...rows];
  return new Level(padded);
}

/** Player standing at column `col` with feet on top of `floorRow` (levelFrom puts the last row at 11). */
export function standingPlayer(level, col, floorRow = 11) {
  const p = new Player(col * 16 + 8, floorRow * 16);
  p.onGround = true;
  return p;
}

/** Step a player `frames` times with a fixed input (or a function frame → input). */
export function run(player, level, input, frames) {
  const all = [];
  for (let f = 0; f < frames; f += 1) all.push(...player.update(typeof input === "function" ? input(f) : input, level, DT));
  return all;
}

/** Step a game `frames` times. */
export function tick(game, input = idle, frames = 1) {
  for (let f = 0; f < frames; f += 1) game.update(typeof input === "function" ? input(f) : input, DT);
}

export const seconds = (s) => Math.ceil(s * 60);
