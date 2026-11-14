/**
 * The robot army ("Thiết Binh") and the supply carriers. Every enemy is a small timer-driven
 * state machine. `game` exposes { player, level, rng, camX, enemyShot(b), spawnEnemy(e), emit() }.
 *
 *   runner   charges along the ground, hops walls, walks off ledges
 *   squad    invisible: sends a runner in from the right edge every few seconds while ahead
 *   gunner   stands and fires aimed shots (8 directions)
 *   sniper   hides in a bush (untouchable), pops up to fire once, hides again
 *   turret   wall cannon that turns toward the player in 30° steps
 *   mortar   lobs shells that land where the player stands
 *   drone    flies in on a wave, drifting toward the player's height
 *   crate    supply crate: shoot it open for its item
 *   pod      supply pod: flies across the top of the screen with an item
 */

import { VIEW_W } from "./constants.js";
import { centerX, centerY, moveX, moveY } from "./physics.js";

const GRAVITY = 900;

export const ENEMY_TYPES = Object.freeze({
  runner: { w: 12, h: 22, hp: 1, score: 100 },
  squad: { w: 1, h: 1, hp: Infinity, score: 0, hidden: true },
  gunner: { w: 12, h: 22, hp: 1, score: 200 },
  sniper: { w: 14, h: 16, hp: 1, score: 300 },
  turret: { w: 16, h: 16, hp: 8, score: 500 },
  mortar: { w: 16, h: 14, hp: 3, score: 400 },
  drone: { w: 14, h: 10, hp: 2, score: 200, flying: true },
  crate: { w: 16, h: 16, hp: 3, score: 100, harmless: true },
  pod: { w: 18, h: 12, hp: 1, score: 300, flying: true, harmless: true },
});

export const SQUAD_PERIOD = 2.4;
export const SQUAD_MAX = 3;

/** (x, bottom) is where the marker stands; flyers use it as their centre line. */
export function createEnemy(kind, x, bottom, extra = {}) {
  const type = ENEMY_TYPES[kind];
  if (!type) throw new Error(`unknown enemy ${kind}`);
  return {
    kind,
    w: type.w,
    h: type.h,
    x: x - type.w / 2,
    y: bottom - type.h,
    vx: 0,
    vy: 0,
    hp: type.hp,
    score: type.score,
    flying: Boolean(type.flying),
    harmless: Boolean(type.harmless),
    hidden: Boolean(type.hidden),
    facing: -1,
    onGround: false,
    t: 0,
    cd: 0.8,
    state: "idle",
    flash: 0,
    angle: Math.PI, // turret barrel
    baseY: bottom - type.h,
    ...extra,
  };
}

/** Enemy shots can be cut from 8 aim directions only, like the player's. */
export function aim8(fromX, fromY, toX, toY) {
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(toY - fromY, toX - fromX) / step) * step;
  return { x: Math.cos(angle), y: Math.sin(angle), angle };
}

function shoot(game, e, ox, oy, vx, vy, extra = {}) {
  game.enemyShot({ kind: "pellet", x: ox - 3, y: oy - 3, w: 6, h: 6, vx, vy, ...extra });
}

function walkPhysics(e, game, dt) {
  if (moveX(game.level, e, e.vx * dt) !== 0) e.blocked = true;
  e.vy = Math.min(e.vy + GRAVITY * dt, 360);
  const hit = moveY(game.level, e, e.vy * dt);
  e.onGround = hit === 1;
  if (hit !== 0) e.vy = 0;
}

const BEHAVIOUR = {
  runner(e, game, dt) {
    e.vx = e.facing * 62;
    e.blocked = false;
    walkPhysics(e, game, dt);
    if (e.blocked && e.onGround) e.vy = -300; // hop over a step
  },

  squad(e, game, dt) {
    const ahead = e.x - game.camX;
    e.t += dt;
    if (ahead < VIEW_W * 0.55 || ahead > VIEW_W + 170) return;
    if (e.t < SQUAD_PERIOD) return;
    const alive = game.enemies.filter((o) => o.squadId === e.id && o.hp > 0).length;
    if (alive >= SQUAD_MAX) return;
    e.t = 0;
    game.spawnEnemy(createEnemy("runner", game.camX + VIEW_W + 8, e.y - 24, { squadId: e.id }));
  },

  gunner(e, game, dt) {
    const p = game.player;
    walkPhysics(e, game, dt);
    e.facing = p.cx < centerX(e) ? -1 : 1;
    e.cd -= dt;
    if (e.cd > 0 || !p.alive) return;
    e.cd = 1.7;
    const ox = centerX(e) + e.facing * 7;
    const oy = e.y + 8;
    const dir = aim8(ox, oy, p.cx, p.cy);
    e.aim = dir;
    shoot(game, e, ox, oy, dir.x * 105, dir.y * 105);
    game.emit("enemy-shot", { x: ox, y: oy });
  },

  sniper(e, game, dt) {
    const p = game.player;
    e.t += dt;
    e.facing = p.cx < centerX(e) ? -1 : 1;
    if (e.state === "idle" && e.t >= 1.8) {
      e.state = "up";
      e.t = 0;
      e.fired = false;
    } else if (e.state === "up") {
      if (!e.fired && e.t >= 0.45 && p.alive) {
        e.fired = true;
        const ox = centerX(e);
        const oy = e.y + 3;
        const dx = p.cx - ox;
        const dy = p.cy - oy;
        const len = Math.hypot(dx, dy) || 1;
        shoot(game, e, ox, oy, (dx / len) * 120, (dy / len) * 120);
        game.emit("enemy-shot", { x: ox, y: oy });
      }
      if (e.t >= 1.2) {
        e.state = "idle";
        e.t = 0;
      }
    }
  },

  turret(e, game, dt) {
    const p = game.player;
    const step = Math.PI / 6;
    const cx = centerX(e);
    const cy = centerY(e);
    e.t += dt;
    if (e.t >= 0.32) {
      e.t = 0;
      const want = Math.atan2(p.cy - cy, p.cx - cx);
      let diff = want - e.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > step / 2) e.angle += Math.sign(diff) * step;
    }
    e.cd -= dt;
    if (e.cd > 0 || !p.alive) return;
    e.cd = 1.5;
    const ox = cx + Math.cos(e.angle) * 11;
    const oy = cy + Math.sin(e.angle) * 11;
    shoot(game, e, ox, oy, Math.cos(e.angle) * 115, Math.sin(e.angle) * 115);
    game.emit("enemy-shot", { x: ox, y: oy });
  },

  mortar(e, game, dt) {
    const p = game.player;
    walkPhysics(e, game, dt);
    e.facing = p.cx < centerX(e) ? -1 : 1;
    e.cd -= dt;
    if (e.cd > 0 || !p.alive) return;
    e.cd = 2.6;
    const flight = 1.3;
    const g = 320;
    const ox = centerX(e);
    const oy = e.y - 2;
    const vx = (p.cx - ox) / flight;
    const vy = (p.y + p.h - oy - 0.5 * g * flight * flight) / flight;
    game.enemyShot({ kind: "shell", x: ox - 4, y: oy - 4, w: 8, h: 8, vx, vy, gravity: g, explode: true });
    game.emit("mortar", { x: ox, y: oy });
  },

  drone(e, game, dt) {
    const p = game.player;
    e.t += dt;
    e.vx = e.facing * 70;
    e.baseY += Math.sign(p.cy - 10 - e.baseY) * Math.min(Math.abs(p.cy - 10 - e.baseY), 22 * dt);
    e.x += e.vx * dt;
    e.y = e.baseY + Math.sin(e.t * 3.2) * 16;
  },

  crate() {},

  pod(e, game, dt) {
    e.t += dt;
    e.x += 72 * dt;
    e.y = e.baseY + Math.sin(e.t * 2.6) * 10;
  },
};

export function updateEnemy(e, game, dt) {
  e.flash = Math.max(0, e.flash - dt);
  BEHAVIOUR[e.kind](e, game, dt);
}

/** Can bullets hit it right now? (a sniper in its bush cannot be hit) */
export function isHittable(e) {
  if (e.hidden || e.hp <= 0) return false;
  return !(e.kind === "sniper" && e.state !== "up");
}

/** Does touching it kill the player? */
export function isDangerous(e) {
  if (e.harmless || e.hidden || e.hp <= 0) return false;
  return !(e.kind === "sniper" && e.state !== "up");
}
