/**
 * Bosses: one per stage, each a timer-driven state machine confined to the arena (the last
 * screen of the stage, where the camera locks). Every attack has a tell and an answer:
 *
 *   spider   Nhện Thép K-9      cannon shells (move), aimed bursts (go prone / jump), crawls forward
 *   gunship  Trực Thăng Ó Đen   bomb run (keep moving), homing missiles (shoot them), bullet fan (gaps)
 *   general  Tướng Thép         rockets (move), beam low (jump) / high (go prone), stomp + shockwaves (jump)
 *
 * Below half health the spider and the general enter phase 2: faster, with extra shots.
 * `game` exposes { player, arena, enemyShot(b), emit(type, data) }.
 */

import { moveY } from "./physics.js";

export const BOSS_INTRO = 1.6;
const GRAVITY = 900;

export const BOSS_TYPES = Object.freeze({
  spider: { name: "Nhện Thép K-9", w: 64, h: 36, hp: 70, flying: false },
  gunship: { name: "Trực Thăng Ó Đen", w: 72, h: 26, hp: 90, flying: true },
  general: { name: "Tướng Thép", w: 40, h: 68, hp: 140, flying: false },
});

export function createBoss(id, arena) {
  const type = BOSS_TYPES[id];
  if (!type) throw new Error(`unknown boss ${id}`);
  const home = id === "gunship" ? arena.left + (arena.right - arena.left - type.w) / 2 : arena.right - 20 - type.w;
  return {
    id,
    name: type.name,
    w: type.w,
    h: type.h,
    x: home,
    y: type.flying ? 22 : arena.floor - type.h,
    home,
    vx: 0,
    vy: 0,
    hp: type.hp,
    maxHp: type.hp,
    flying: type.flying,
    facing: -1,
    phase: 1,
    state: "idle",
    t: 0,
    step: 0,
    turn: 0,
    flash: 0,
    introT: BOSS_INTRO,
    onGround: !type.flying,
    forward: false,
  };
}

/** Apply a hit. Returns the damage dealt (0 during the intro or once destroyed). */
export function damageBoss(boss, damage, game) {
  if (boss.introT > 0 || boss.hp <= 0) return 0;
  const dealt = Math.min(boss.hp, damage);
  boss.hp -= dealt;
  boss.flash = 0.08;
  if (boss.phase === 1 && boss.id !== "gunship" && boss.hp <= boss.maxHp / 2) {
    boss.phase = 2;
    game?.emit("phase", { boss: boss.id });
  }
  return dealt;
}

function setState(boss, state) {
  boss.state = state;
  boss.t = 0;
  boss.step = 0;
}

const cx = (b) => b.x + b.w / 2;

/** An arcing shot that lands at (tx, floor) after `flight` seconds and explodes. */
function lob(game, kind, ox, oy, tx, flight, gravity = 380) {
  const floor = game.arena.floor;
  const vx = (tx - ox) / flight;
  const vy = (floor - oy - 0.5 * gravity * flight * flight) / flight;
  game.enemyShot({ kind, x: ox - 4, y: oy - 4, w: 8, h: 8, vx, vy, gravity, explode: true });
}

function aimedShot(game, ox, oy, speed, extra = {}) {
  const p = game.player;
  const dx = p.cx - ox;
  const dy = p.cy - oy;
  const len = Math.hypot(dx, dy) || 1;
  game.enemyShot({ kind: "pellet", x: ox - 3, y: oy - 3, w: 6, h: 6, vx: (dx / len) * speed, vy: (dy / len) * speed, ...extra });
}

function groundPhysics(boss, game, dt) {
  boss.vy = Math.min(boss.vy + GRAVITY * dt, 420);
  boss.x += boss.vx * dt;
  const a = game.arena;
  boss.x = Math.max(a.left + 4, Math.min(a.right - 4 - boss.w, boss.x));
  const hit = moveY(game.level, boss, boss.vy * dt, { ledges: false });
  const landed = hit === 1 && !boss.onGround;
  boss.onGround = hit === 1;
  if (hit !== 0) boss.vy = 0;
  return landed;
}

const PATTERNS = {
  spider(boss, game, dt) {
    const p = game.player;
    const a = game.arena;
    const pace = boss.phase === 2 ? 0.7 : 1;
    boss.t += dt;
    boss.vx = 0;
    switch (boss.state) {
      case "idle":
        if (boss.t >= 0.9 * pace) {
          boss.turn += 1;
          setState(boss, ["cannon", "gun", "crawl"][boss.turn % 3]);
        }
        break;
      case "cannon": {
        const shells = boss.phase === 2 ? 4 : 3;
        if (boss.step < shells && boss.t >= boss.step * 0.38 * pace) {
          lob(game, "shell", boss.x + 22, boss.y + 2, p.cx + (boss.step - 1) * 30, 1.1);
          game.emit("boss-fire", { x: boss.x + 22, y: boss.y });
          boss.step += 1;
        } else if (boss.step >= shells && boss.t >= shells * 0.38 * pace + 0.5) {
          setState(boss, "idle");
        }
        break;
      }
      case "gun": {
        const shots = boss.phase === 2 ? 8 : 6;
        if (boss.step < shots && boss.t >= 0.3 + boss.step * 0.13) {
          aimedShot(game, boss.x + 4, boss.y + 22, 140);
          game.emit("boss-fire", { x: boss.x + 4, y: boss.y + 22 });
          boss.step += 1;
        } else if (boss.step >= shots && boss.t >= 0.3 + shots * 0.13 + 0.4) {
          setState(boss, "idle");
        }
        break;
      }
      case "crawl": {
        // alternate between its home and the middle of the arena, always leaving room behind the player
        const target = boss.forward ? boss.home : a.left + 150;
        const dx = target - boss.x;
        boss.vx = Math.sign(dx) * 70 / pace;
        if (Math.abs(dx) <= Math.abs(boss.vx * dt)) {
          boss.x = target;
          boss.vx = 0;
          boss.forward = !boss.forward;
          setState(boss, "idle");
        }
        if (Math.floor(boss.t * 4) !== Math.floor((boss.t - dt) * 4)) game.emit("step");
        break;
      }
      default:
        setState(boss, "idle");
    }
    groundPhysics(boss, game, dt);
  },

  gunship(boss, game, dt) {
    const p = game.player;
    const a = game.arena;
    boss.t += dt;
    const minX = a.left + 6;
    const maxX = a.right - 6 - boss.w;
    switch (boss.state) {
      case "idle": {
        const target = Math.max(minX, Math.min(maxX, p.cx - boss.w / 2));
        boss.x += Math.sign(target - boss.x) * Math.min(Math.abs(target - boss.x), 55 * dt);
        if (boss.t >= 1.0) {
          boss.turn += 1;
          setState(boss, ["bombs", "missiles", "spray"][boss.turn % 3]);
          boss.facing = cx(boss) < (a.left + a.right) / 2 ? 1 : -1;
        }
        break;
      }
      case "bombs": {
        boss.x += boss.facing * 115 * dt;
        if (boss.t >= 0.15 + boss.step * 0.28) {
          game.enemyShot({ kind: "bomb", x: cx(boss) - 4, y: boss.y + boss.h - 2, w: 8, h: 8, vx: 0, vy: 30, gravity: 420, explode: true });
          boss.step += 1;
        }
        if (boss.x <= minX || boss.x >= maxX) {
          boss.x = Math.max(minX, Math.min(maxX, boss.x));
          setState(boss, "idle");
        }
        break;
      }
      case "missiles":
        if (boss.step < 2 && boss.t >= 0.25 + boss.step * 0.5) {
          const side = boss.step === 0 ? -1 : 1;
          game.enemyShot({
            kind: "missile", x: cx(boss) + side * 20 - 4, y: boss.y + boss.h, w: 8, h: 8,
            vx: side * 50, vy: 60, homing: 1.7, life: 4.5, hp: 1, shootable: true,
          });
          game.emit("boss-fire", { x: cx(boss), y: boss.y + boss.h });
          boss.step += 1;
        } else if (boss.step >= 2 && boss.t >= 1.7) {
          setState(boss, "idle");
        }
        break;
      case "spray":
        if (boss.step < 2 && boss.t >= 0.35 + boss.step * 0.6) {
          const offset = boss.step === 0 ? 0 : Math.PI / 24; // the second fan fills the first one's gaps
          for (let i = 0; i < 7; i += 1) {
            const angle = Math.PI / 4 + (i * Math.PI) / 12 + offset;
            game.enemyShot({ kind: "pellet", x: cx(boss) - 3, y: boss.y + boss.h - 3, w: 6, h: 6, vx: Math.cos(angle) * 105, vy: Math.sin(angle) * 105 });
          }
          game.emit("boss-fire", { x: cx(boss), y: boss.y + boss.h });
          boss.step += 1;
        } else if (boss.step >= 2 && boss.t >= 1.6) {
          setState(boss, "idle");
        }
        break;
      default:
        setState(boss, "idle");
    }
    boss.y = 22 + Math.sin(game.time * 2) * 4;
  },

  general(boss, game, dt) {
    const p = game.player;
    const a = game.arena;
    const pace = boss.phase === 2 ? 0.7 : 1;
    boss.t += dt;
    if (boss.onGround) boss.vx = 0;
    switch (boss.state) {
      case "idle":
        boss.facing = p.cx < cx(boss) ? -1 : 1;
        if (boss.t >= 1.0 * pace) {
          boss.turn += 1;
          setState(boss, ["rockets", "beam", "stomp"][boss.turn % 3]);
        }
        break;
      case "rockets": {
        const count = boss.phase === 2 ? 4 : 3;
        if (boss.step < count && boss.t >= boss.step * 0.3) {
          lob(game, "rocket", boss.x + 8, boss.y + 6, p.cx + (boss.step - 1) * 30, 1.2, 300);
          game.emit("boss-fire", { x: boss.x + 8, y: boss.y + 6 });
          boss.step += 1;
        } else if (boss.step >= count && boss.t >= count * 0.3 + 0.6) {
          setState(boss, "idle");
        }
        break;
      }
      case "beam": {
        // phase 1: one beam, low or high in turn; phase 2: low then high back to back
        const beams = boss.phase === 2 ? 2 : 1;
        const every = 1.5;
        if (boss.step < beams && boss.t >= boss.step * every) {
          const low = boss.phase === 2 ? boss.step === 0 : boss.turn % 2 === 0;
          fireBeam(game, boss, low);
          boss.step += 1;
        } else if (boss.step >= beams && boss.t >= beams * every + 0.2) {
          setState(boss, "idle");
        }
        break;
      }
      case "stomp":
        if (boss.step === 0) {
          const target = Math.max(a.left + 70, Math.min(boss.home, p.cx - boss.w / 2));
          boss.vy = -380;
          boss.onGround = false;
          boss.vx = (target - boss.x) / 0.84; // airtime of a -380 jump
          boss.step = 1;
          game.emit("boss-jump");
        } else if (boss.step === 1 && boss.landed) {
          for (const dir of [-1, 1]) {
            game.enemyShot({ kind: "shock", x: cx(boss) - 6 + dir * 20, y: a.floor - 10, w: 12, h: 10, vx: dir * 130, vy: 0, ghost: true, life: 2.6 });
          }
          game.emit("quake");
          boss.step = 2;
          boss.t = 0;
        } else if (boss.step === 2 && boss.t >= 0.5) {
          setState(boss, "return");
        }
        break;
      case "return": {
        const dx = boss.home - boss.x;
        boss.vx = Math.sign(dx) * 60;
        if (Math.abs(dx) <= 60 * dt + 0.5) {
          boss.x = boss.home;
          boss.vx = 0;
          setState(boss, "idle");
        }
        break;
      }
      default:
        setState(boss, "idle");
    }
    boss.landed = groundPhysics(boss, game, dt);
  },
};

/** Beam heights against the player's hurtboxes: low = jump over it, high = go prone under it. */
export const BEAM = Object.freeze({ lowTop: 8, lowH: 6, highTop: 20, highH: 8, warn: 0.8, live: 0.42 });

function fireBeam(game, boss, low) {
  const a = game.arena;
  const top = a.floor - (low ? BEAM.lowTop : BEAM.highTop);
  game.enemyShot({
    kind: "beam", low, x: a.left, y: top, w: boss.x - a.left, h: low ? BEAM.lowH : BEAM.highH,
    vx: 0, vy: 0, ghost: true, warnT: BEAM.warn, life: BEAM.warn + BEAM.live,
  });
  game.emit("warning");
}

export function updateBoss(boss, game, dt) {
  boss.flash = Math.max(0, boss.flash - dt);
  if (boss.introT > 0) {
    boss.introT = Math.max(0, boss.introT - dt);
    if (!boss.flying) groundPhysics(boss, game, dt);
    return;
  }
  PATTERNS[boss.id](boss, game, dt);
}
