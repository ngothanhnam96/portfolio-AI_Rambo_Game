/**
 * Route search over the real player physics. Nodes are standing snapshots (quantised to 4 px);
 * edges are short input macros (walk, step, jumps with different drift timings, drop through a
 * ledge) simulated frame by frame with Player.update. Enemies are ignored; hazards and pits
 * kill. The goal is entering the boss arena.
 */

import { DT, TILE } from "../../src/core/constants.js";
import { inHazard } from "../../src/core/physics.js";
import { Player } from "../../src/core/player.js";

const MAX_FRAMES = 400;

const key = (p) => `${Math.round(p.x / 4)},${Math.round(p.y / 4)}`;
const input = (dir, jump = false, down = false) => ({ left: dir < 0, right: dir > 0, up: false, down, jump, shoot: false });

/** Run `script(frame) → input` until the player lands again (after `minFrames`), dies or wins. */
function simulate(start, level, script, goalX, minFrames = 3) {
  const p = start.clone();
  p.prev = input(0);
  for (let frame = 0; frame < MAX_FRAMES; frame += 1) {
    p.update(script(frame), level, DT);
    if (inHazard(level, p)) return null;
    if (p.x >= goalX) return { player: p, goal: true };
    if (frame >= minFrames && p.onGround) return { player: p, goal: false };
  }
  return null;
}

function macros() {
  const list = [];
  for (const dir of [-1, 1]) {
    list.push((f) => input(f < 6 ? dir : 0)); // step
    list.push(() => input(dir)); // walk until landing somewhere new
    list.push((f) => input(dir, f < 2)); // jump with full drift
    list.push((f) => input(f < 10 ? 0 : dir, f < 2)); // jump, drift late
    list.push((f) => input(f < 18 ? dir : 0, f < 2)); // jump, stop drifting early
    list.push((f) => input(f < 8 ? dir : 0, f < 2)); // short hop forward
  }
  list.push((f) => input(0, f < 2)); // straight up (onto a ledge above)
  list.push((f) => input(0, f < 2, f < 2)); // drop through a ledge
  return list;
}

/** Breadth-first search from (cx, bottom). Returns { reached, nodes, furthest }. */
export function findRoute(level, from, { maxNodes = 30000 } = {}) {
  const goalX = level.arenaX + 2 * TILE;
  const settled = simulate(new Player(from.x, from.y), level, () => input(0), goalX, 0);
  if (!settled) return { reached: false, nodes: 0, furthest: from.x };
  const queue = [settled.player];
  const seen = new Set([key(settled.player)]);
  const all = macros();
  for (let head = 0; head < queue.length && seen.size < maxNodes; head += 1) {
    for (const macro of all) {
      const result = simulate(queue[head], level, macro, goalX);
      if (!result) continue;
      if (result.goal) return { reached: true, nodes: seen.size };
      const k = key(result.player);
      if (!seen.has(k)) {
        seen.add(k);
        queue.push(result.player);
      }
    }
  }
  return { reached: false, nodes: seen.size, furthest: Math.max(...queue.map((p) => p.x)) };
}
