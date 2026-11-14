/**
 * A simple scripted soldier used to prove every boss can be beaten with the starting rifle.
 * It keeps a medium distance, aims at the boss's centre with the 8-way aim (moving under a
 * flyer and shooting straight up or diagonally) and holds the trigger.
 */

import { DT } from "../../src/core/constants.js";
import { idle } from "./helpers.js";

/** Teleport to just before the arena and walk in until the boss appears and its intro ends. */
export function enterArena(game) {
  const level = game.level;
  const x = level.arenaX - 40;
  game.player.x = x;
  game.player.y = 10 * 16 - game.player.h;
  game.camX = Math.max(game.camX, x - 140);
  game.state = "playing";
  for (const m of game.markers) m.used = true;
  game.enemies = [];
  for (let f = 0; f < 60 * 15 && !(game.boss && game.boss.introT === 0); f += 1) {
    game.update(game.boss ? idle : { ...idle, right: true }, DT);
  }
}

/** Fight until the boss falls or `seconds` run out. Returns the seconds taken (or Infinity). */
export function fightBoss(game, seconds = 120) {
  for (let f = 0; f < seconds * 60; f += 1) {
    if (game.state !== "playing") return f / 60;
    const p = game.player;
    const b = game.boss;
    const dx = b.x + b.w / 2 - p.cx;
    const dy = b.y + b.h / 2 - p.cy;
    const toward = Math.sign(dx) || 1;
    const above = dy < -20;
    let move = 0;
    let up = false;
    if (above) {
      up = true; // straight up when underneath, diagonally up while closing in
      if (Math.abs(dx) > b.w / 3) move = toward;
    } else if (Math.abs(dx) > 120) move = toward;
    else if (Math.abs(dx) < 70) move = -toward;
    if (!above && p.facing !== toward && f % 6 === 0) move = toward;
    game.update({ ...idle, left: move < 0, right: move > 0, up, shoot: true }, DT);
  }
  return Infinity;
}
