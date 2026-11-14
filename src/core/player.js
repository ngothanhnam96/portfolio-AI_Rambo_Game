/**
 * The commando: run, a fixed-height spin jump with air control, lie prone, drop through
 * ledges, and aim in 8 directions. One hit is fatal, so what matters most is the *hurtbox*,
 * which changes with the pose:
 *
 *   standing / running   10 × 20
 *   prone                18 × 9  (low shots and beams pass overhead)
 *   spin jump            10 × 12 (curled up in the air)
 *
 * Input is a snapshot of held buttons: { left, right, up, down, jump, shoot }.
 * Aiming:  → (facing) · ↑ straight up · ↑+→ diagonal up (while running) ·
 *          ↓+→ diagonal down (while running) · ↓ prone on the ground / straight down in the air.
 */

import { moveX, moveY, standingOn } from "./physics.js";

export const PLAYER = Object.freeze({
  w: 12,
  h: 22,
  run: 78, // px/s
  jump: 330, // initial upward speed: ~60 px high, ~0.73 s in the air
  gravity: 900,
  maxFall: 360,
  dropTime: 0.2, // ledges are ignored this long after ↓ + jump
  spawnInvuln: 2.5,
});

export const NO_INPUT = Object.freeze({ left: false, right: false, up: false, down: false, jump: false, shoot: false });

const D = Math.SQRT1_2;

export class Player {
  /** (cx, bottom): spawn with feet at `bottom`, centred on `cx`. */
  constructor(cx, bottom) {
    this.w = PLAYER.w;
    this.h = PLAYER.h;
    this.x = cx - this.w / 2;
    this.y = bottom - this.h;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.aim = { x: 1, y: 0 };
    this.onGround = false;
    this.spinning = false;
    this.prone = false;
    this.dropT = 0;
    this.invulnT = 0;
    this.shieldT = 0;
    this.alive = true;
    this.prev = NO_INPUT;
  }

  clone() {
    return Object.assign(Object.create(Player.prototype), this, { aim: { ...this.aim } });
  }

  get cx() {
    return this.x + this.w / 2;
  }

  get cy() {
    return this.y + this.h / 2;
  }

  get safe() {
    return this.invulnT > 0 || this.shieldT > 0;
  }

  /** The box enemies and shots must touch to kill, which depends on the pose. */
  get hurtbox() {
    if (this.prone) return { x: this.x - 3, y: this.y + this.h - 9, w: this.w + 6, h: 9 };
    if (this.spinning) return { x: this.x + 1, y: this.y + 5, w: this.w - 2, h: 12 };
    return { x: this.x + 1, y: this.y + 2, w: this.w - 2, h: this.h - 2 };
  }

  /** Where bullets leave the gun for the current aim and pose. */
  muzzle() {
    const { x: ax, y: ay } = this.aim;
    const front = this.facing > 0 ? this.x + this.w : this.x;
    if (this.spinning) return { x: this.cx + ax * 8, y: this.cy + ay * 8 };
    if (this.prone) return { x: front + this.facing * 10, y: this.y + this.h - 5 };
    if (ax === 0) return ay < 0 ? { x: this.cx + this.facing * 2, y: this.y - 4 } : { x: this.cx, y: this.y + this.h + 2 };
    if (ay < 0) return { x: front + this.facing * 2, y: this.y + 1 };
    if (ay > 0) return { x: front + this.facing * 2, y: this.y + 16 };
    return { x: front + this.facing * 4, y: this.y + 9 };
  }

  /** Advance one step. Returns actions: { type: "jump" | "land" | "drop" }. */
  update(input, level, dt) {
    const actions = [];
    const P = PLAYER;
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const jumpPressed = input.jump && !this.prev.jump;
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.shieldT = Math.max(0, this.shieldT - dt);
    this.dropT = Math.max(0, this.dropT - dt);
    if (dir !== 0) this.facing = dir;

    // --- jump / drop through a ledge ---
    if (jumpPressed && this.onGround) {
      if (input.down && standingOn(level, this, { ledgesOnly: true })) {
        this.dropT = P.dropTime;
        this.onGround = false;
        actions.push({ type: "drop" });
      } else {
        this.vy = -P.jump;
        this.onGround = false;
        this.spinning = true;
        actions.push({ type: "jump" });
      }
    }

    this.prone = this.onGround && input.down && dir === 0;
    this.vx = this.prone ? 0 : dir * P.run;

    // --- gravity & move ---
    this.vy = Math.min(this.vy + P.gravity * dt, P.maxFall);
    moveX(level, this, this.vx * dt);
    const hitY = moveY(level, this, this.vy * dt, { ledges: this.dropT === 0 });
    if (hitY === 1) {
      if (!this.onGround) actions.push({ type: "land" });
      this.onGround = true;
      this.spinning = false;
      this.vy = 0;
    } else {
      if (hitY === -1) this.vy = 0;
      this.onGround = false;
    }
    if (!this.onGround) this.prone = false;

    this.aim = this.aimFor(input, dir);
    this.prev = { ...input };
    return actions;
  }

  aimFor(input, dir) {
    if (this.prone) return { x: this.facing, y: 0 };
    if (input.up) return dir !== 0 ? { x: dir * D, y: -D } : { x: 0, y: -1 };
    if (input.down && dir !== 0) return { x: dir * D, y: D };
    if (input.down && !this.onGround) return { x: 0, y: 1 };
    return { x: this.facing, y: 0 };
  }
}
