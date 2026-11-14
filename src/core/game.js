/**
 * Game state machine. Pure logic, fixed 60 Hz steps: the UI feeds held-button snapshots into
 * update() and drains takeEvents() for sounds and particles.
 *
 *   title → intro → playing ⇄ paused
 *                     │ camera reaches the arena → boss fight → boss-dying → clear → intro (next stage)
 *                     └ dying → playing (respawn, falling in from the sky) | game-over → continue
 *   last stage cleared → victory
 *
 * The camera only scrolls forward. One hit kills; dying costs a life and the weapon you carried.
 */

import { BOSS_TYPES, createBoss, damageBoss, updateBoss } from "./bosses.js";
import { FLOOR_ROW, TILE, VIEW_H, VIEW_W } from "./constants.js";
import { createEnemy, isDangerous, isHittable, SQUAD_PERIOD, updateEnemy } from "./enemies.js";
import { inHazard, moveY, overlaps } from "./physics.js";
import { NO_INPUT, Player, PLAYER } from "./player.js";
import { mulberry32, randomSeed } from "./rng.js";
import { buildLevel, STAGES } from "./stages.js";
import { fireWeapon, SHIELD_TIME, WEAPONS } from "./weapons.js";

export const START_LIVES = 3;
export const MAX_LIVES = 9;
export const CONTINUES = 2;
export const EXTRA_LIFE_EVERY = 20000;
export const BOSS_SCORE = 10000;
export const MISSILE_SCORE = 50;
export const INTRO_TIME = 1.6;
export const DYING_TIME = 1.4;
export const BOSS_DYING_TIME = 2.6;
export const CAMERA_LEAD = 0.42; // the camera keeps the player at 42 % of the screen width
const DESPAWN = 40;

export class Game {
  constructor({ seed = randomSeed(), invincible = false } = {}) {
    this.rng = mulberry32(seed);
    this.invincible = invincible; // tests / bots only
    this.state = "title";
    this.events = [];
    this.score = 0;
    this.lives = START_LIVES;
    this.continues = CONTINUES;
    this.nextLifeAt = EXTRA_LIFE_EVERY;
    this.stageIndex = 0;
    this.stage = null;
    this.level = null;
    this.player = null;
    this.boss = null;
    this.weapon = "rifle";
    this.time = 0;
    this.camX = 0;
  }

  // ------------------------------------------------------------------ progress & menus

  newGame(stageIndex = 0) {
    this.score = 0;
    this.lives = START_LIVES;
    this.continues = CONTINUES;
    this.nextLifeAt = EXTRA_LIFE_EVERY;
    this.weapon = "rifle";
    this.startStage(stageIndex);
    return this;
  }

  /** After game over: fresh lives, score back to zero, same stage from its last checkpoint. */
  continueGame() {
    if (this.state !== "game-over" || this.continues <= 0) return false;
    this.continues -= 1;
    this.score = 0;
    this.lives = START_LIVES;
    this.nextLifeAt = EXTRA_LIFE_EVERY;
    this.weapon = "rifle";
    this.startStage(this.stageIndex, { checkpoint: this.checkpoint });
    return true;
  }

  nextStage() {
    if (this.state !== "clear") return false;
    this.startStage(this.stageIndex + 1);
    return true;
  }

  togglePause() {
    if (this.state === "playing") this.state = "paused";
    else if (this.state === "paused") this.state = "playing";
    return this.state;
  }

  takeEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  get arena() {
    const left = this.level.arenaX;
    return { left, right: left + VIEW_W, top: 0, floor: FLOOR_ROW * TILE };
  }

  // ------------------------------------------------------------------ stage lifecycle

  startStage(index, { checkpoint = -1 } = {}) {
    this.stageIndex = index;
    this.stage = STAGES[index];
    this.level = buildLevel(this.stage);
    this.checkpoint = checkpoint;
    this.time = 0;
    this.enemies = [];
    this.bullets = [];
    this.enemyBullets = [];
    this.items = [];
    this.boss = null;
    this.bossDone = false;
    this.fireCd = 0;
    const at = checkpoint >= 0 ? this.level.checkpoints[checkpoint] : this.level.start;
    this.player = new Player(at.x, at.y);
    this.player.onGround = true;
    this.camX = Math.max(0, Math.min(this.level.arenaX, at.x - VIEW_W * CAMERA_LEAD));
    let pod = 0;
    this.markers = this.level.spawns.map((s) => ({
      ...s,
      item: s.kind === "pod" ? this.stage.pods[pod++ % this.stage.pods.length] : s.item,
      used: s.x < this.camX + VIEW_W / 2 && s.x < at.x, // restarting at a checkpoint skips what is behind it
    }));
    this.state = "intro";
    this.timer = INTRO_TIME;
    this.emit("stage-start", { stage: this.stage.id });
  }

  // ------------------------------------------------------------------ main update

  update(input, dt) {
    switch (this.state) {
      case "intro":
        this.player.update(NO_INPUT, this.level, dt);
        this.timer -= dt;
        if (this.timer <= 0) this.state = "playing";
        break;
      case "playing":
        this.step(input, dt);
        break;
      case "boss-dying":
        this.step(input, dt);
        this.timer -= dt;
        if (this.timer <= 0) this.finishStage();
        break;
      case "dying":
        this.step(NO_INPUT, dt);
        this.timer -= dt;
        if (this.timer <= 0) {
          this.lives -= 1;
          if (this.lives <= 0) {
            this.state = "game-over";
            this.emit("game-over", { score: this.score });
          } else {
            this.respawn();
          }
        }
        break;
      default:
        break; // title, paused, clear, game-over, victory: waiting for the UI
    }
  }

  step(input, dt) {
    this.time += dt;
    const p = this.player;
    if (p.alive) {
      for (const action of p.update(input, this.level, dt)) this.emit(action.type, { x: p.cx, y: p.y + p.h });
      const right = this.camX + VIEW_W - p.w;
      if (p.x < this.camX) p.x = this.camX;
      if (p.x > right) p.x = right;
      this.fireCd = Math.max(0, this.fireCd - dt);
      if (input.shoot && this.fireCd === 0) this.fire();
    } else {
      this.updateCorpse(dt);
    }

    if (!this.boss && p.alive) {
      const target = Math.min(this.level.arenaX, p.cx - VIEW_W * CAMERA_LEAD);
      this.camX = Math.max(this.camX, target);
    }
    this.updateCheckpoints();
    this.activateMarkers();
    if (!this.boss && !this.bossDone && this.camX >= this.level.arenaX) {
      this.boss = createBoss(this.stage.boss, this.arena);
      this.emit("boss-intro", { boss: this.stage.boss, name: BOSS_TYPES[this.stage.boss].name });
    }

    for (const e of this.enemies) {
      if (e.kind === "squad" || e.x < this.camX + VIEW_W + 24) updateEnemy(e, this, dt);
    }
    if (this.boss && this.boss.hp > 0) updateBoss(this.boss, this, dt);
    this.updateBullets(dt);
    this.updateItems(dt);
    this.collide();
    if (p.alive && inHazard(this.level, p)) this.killPlayer();
    this.cleanup();
    this.checkExtraLife();
  }

  /** Falls back in from the top of the screen, on the first safe ground near the left edge. */
  respawn() {
    const level = this.level;
    let col = Math.floor((this.camX + 40) / TILE);
    const last = Math.floor((this.camX + VIEW_W - 24) / TILE);
    while (col < last && level.floorRow(col) < 0) col += 1;
    const p = new Player(col * TILE + TILE / 2, TILE + PLAYER.h);
    p.invulnT = PLAYER.spawnInvuln;
    this.player = p;
    this.fireCd = 0;
    this.state = "playing";
    this.emit("respawn", { x: p.cx, y: p.y });
  }

  killPlayer() {
    const p = this.player;
    p.alive = false;
    p.prone = false;
    p.spinning = false;
    p.vx = -p.facing * 50;
    p.vy = -220;
    p.deadT = 0;
    this.weapon = "rifle";
    this.state = "dying";
    this.timer = DYING_TIME;
    this.emit("death", { x: p.cx, y: p.cy });
  }

  updateCorpse(dt) {
    const p = this.player;
    p.deadT += dt;
    p.vy = Math.min(p.vy + 900 * dt, 360);
    p.x += p.vx * dt;
    if (moveY(this.level, p, p.vy * dt) === 1) {
      p.vy = 0;
      p.vx = 0;
    }
  }

  defeatBoss() {
    this.score += BOSS_SCORE;
    this.bossDone = true;
    this.enemyBullets = [];
    this.enemies = [];
    this.state = "boss-dying";
    this.timer = BOSS_DYING_TIME;
    const b = this.boss;
    this.emit("boss-defeat", { x: b.x + b.w / 2, y: b.y + b.h / 2 });
  }

  finishStage() {
    this.clearInfo = { stage: this.stage.id, time: this.time, final: Boolean(this.stage.final) };
    this.state = this.stage.final ? "victory" : "clear";
    this.emit(this.state, this.clearInfo);
  }

  checkExtraLife() {
    while (this.score >= this.nextLifeAt) {
      this.nextLifeAt += EXTRA_LIFE_EVERY;
      if (this.lives < MAX_LIVES) {
        this.lives += 1;
        this.emit("extra-life");
      }
    }
  }

  // ------------------------------------------------------------------ pieces

  fire() {
    const p = this.player;
    const spec = WEAPONS[this.weapon];
    const volley = fireWeapon(this.weapon, p.muzzle(), p.aim);
    const onScreen = this.bullets.filter((b) => b.weapon === this.weapon).length;
    if (onScreen + volley.length > spec.max) return;
    this.fireCd = spec.rate;
    this.bullets.push(...volley);
    this.emit("shoot", { weapon: this.weapon, x: p.muzzle().x, y: p.muzzle().y });
  }

  enemyShot(bullet) {
    this.enemyBullets.push({ gravity: 0, life: 4, warnT: 0, homing: 0, ...bullet });
  }

  spawnEnemy(enemy) {
    this.enemies.push(enemy);
  }

  updateCheckpoints() {
    const checkpoints = this.level.checkpoints;
    for (let i = this.checkpoint + 1; i < checkpoints.length; i += 1) {
      if (this.player.alive && this.player.cx >= checkpoints[i].x) {
        this.checkpoint = i;
        this.emit("checkpoint", { x: checkpoints[i].x, y: checkpoints[i].y });
      }
    }
  }

  /** Markers come alive as they scroll into view (pods once the camera is halfway to them). */
  activateMarkers() {
    const right = this.camX + VIEW_W;
    for (const m of this.markers) {
      if (m.used) continue;
      if (m.kind === "pod") {
        if (m.x > this.camX + VIEW_W / 2) continue;
        this.enemies.push(createEnemy("pod", this.camX - 10, m.y, { item: m.item }));
      } else if (m.kind === "drone") {
        if (m.x > right + 8) continue;
        this.enemies.push(createEnemy("drone", right + 10, m.y));
      } else {
        if (m.x - 8 > right + 8) continue;
        const e = createEnemy(m.kind, m.x, m.y, { item: m.item, id: m.id });
        if (m.kind === "squad") e.t = SQUAD_PERIOD - 0.6;
        if (m.kind === "runner") e.facing = this.player.cx < m.x ? -1 : 1;
        this.enemies.push(e);
      }
      m.used = true;
    }
  }

  updateBullets(dt) {
    const level = this.level;
    const left = this.camX - 16;
    const right = this.camX + VIEW_W + 16;
    const blocked = (b, ledges) => {
      const col = Math.floor((b.x + b.w / 2) / TILE);
      const row = Math.floor((b.y + b.h / 2) / TILE);
      return level.isSolid(col, row) || (ledges && level.isLedge(col, row));
    };
    const onScreen = (b, pad = 0) => b.x + b.w > left - pad && b.x < right + pad && b.y + b.h > -16 - pad && b.y < VIEW_H + 16;

    this.bullets = this.bullets.filter((b) => {
      if (b.homing) this.steer(b, this.homingTarget(b), b.homing * dt);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      return b.life > 0 && !b.dead && onScreen(b) && !blocked(b, false);
    });

    const p = this.player;
    const next = [];
    for (const b of this.enemyBullets) {
      b.life -= dt;
      if (b.warnT > 0) {
        b.warnT -= dt;
        if (b.life > 0) next.push(b);
        continue;
      }
      if (b.homing && p.alive) this.steer(b, p, b.homing * dt);
      b.vy += b.gravity * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (!b.ghost && blocked(b, b.gravity > 0)) {
        if (b.explode) this.blast(b);
        continue;
      }
      if (b.life > 0 && onScreen(b, 40)) next.push(b);
    }
    this.enemyBullets = next;
  }

  /** A shell, bomb or rocket bursts where it lands; the burst itself is deadly for a moment. */
  blast(b) {
    const x = b.x + b.w / 2;
    const y = Math.floor((b.y + b.h / 2) / TILE) * TILE;
    this.enemyBullets.push({ kind: "blast", x: x - 8, y: y - 14, w: 16, h: 14, vx: 0, vy: 0, gravity: 0, homing: 0, warnT: 0, ghost: true, life: 0.3 });
    this.emit("blast", { x, y });
  }

  homingTarget(b) {
    let best = null;
    let bestD = 200 * 200;
    const consider = (t) => {
      const d = (t.x + t.w / 2 - b.x) ** 2 + (t.y + t.h / 2 - b.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { cx: t.x + t.w / 2, cy: t.y + t.h / 2 };
      }
    };
    for (const e of this.enemies) if (isHittable(e) && !e.harmless) consider(e);
    if (this.boss && this.boss.hp > 0 && this.boss.introT === 0) consider(this.boss);
    return best;
  }

  /** Turn a bullet's velocity toward `target` ({cx, cy}) by at most `maxTurn` radians. */
  steer(b, target, maxTurn) {
    if (!target) return;
    const want = Math.atan2(target.cy - (b.y + b.h / 2), target.cx - (b.x + b.w / 2));
    const have = Math.atan2(b.vy, b.vx);
    let turn = want - have;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    const angle = have + Math.max(-maxTurn, Math.min(maxTurn, turn));
    const speed = Math.hypot(b.vx, b.vy);
    b.vx = Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed;
  }

  updateItems(dt) {
    for (const item of this.items) {
      item.vy = Math.min(item.vy + 600 * dt, 260);
      item.x += item.vx * dt;
      if (moveY(this.level, item, item.vy * dt) === 1) {
        item.vy = 0;
        item.vx = 0;
      }
    }
  }

  collide() {
    const p = this.player;
    for (const b of this.bullets) {
      for (const e of this.enemies) {
        if (!isHittable(e) || b.hits.has(e) || !overlaps(b, e)) continue;
        e.hp -= b.damage;
        e.flash = 0.08;
        b.hits.add(e);
        if (e.hp <= 0) this.killEnemy(e);
        else this.emit("hit", { x: b.x + b.w / 2, y: b.y + b.h / 2 });
        if (!b.pierce) {
          b.dead = true;
          break;
        }
      }
      if (b.dead) continue;
      for (const s of this.enemyBullets) {
        if (!s.shootable || s.life <= 0 || !overlaps(b, s)) continue;
        s.hp -= b.damage;
        if (s.hp <= 0) {
          s.life = 0;
          this.score += MISSILE_SCORE;
          this.emit("explode", { x: s.x + s.w / 2, y: s.y + s.h / 2, kind: "missile" });
        }
        if (!b.pierce) {
          b.dead = true;
          break;
        }
      }
      const boss = this.boss;
      if (!b.dead && boss && boss.hp > 0 && !b.hits.has(boss) && overlaps(b, boss)) {
        const dealt = damageBoss(boss, b.damage, this);
        if (b.pierce) b.hits.add(boss);
        else b.dead = true;
        this.emit(dealt > 0 ? "boss-hit" : "deflect", { x: b.x + b.w / 2, y: b.y + b.h / 2 });
        if (boss.hp <= 0) this.defeatBoss();
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);
    this.enemies = this.enemies.filter((e) => e.hp > 0);
    this.enemyBullets = this.enemyBullets.filter((s) => s.life > 0);

    if (!p.alive) return;
    // supplies are picked up with the whole body
    this.items = this.items.filter((item) => {
      if (!overlaps(p, item)) return true;
      this.collect(item);
      return false;
    });

    if (this.state !== "playing" || this.invincible || p.safe) return;
    const hb = p.hurtbox;
    const deadly = this.enemies.some((e) => isDangerous(e) && overlaps(hb, e))
      || this.enemyBullets.some((s) => s.warnT <= 0 && overlaps(hb, s))
      || (this.boss && this.boss.hp > 0 && overlaps(hb, this.boss));
    if (deadly) this.killPlayer();
  }

  killEnemy(e) {
    this.score += e.score;
    this.emit("explode", { x: e.x + e.w / 2, y: e.y + e.h / 2, kind: e.kind });
    if (e.item) {
      this.items.push({ kind: e.item, x: e.x + e.w / 2 - 7, y: e.y + e.h / 2 - 6, w: 14, h: 12, vx: e.kind === "pod" ? 40 : 0, vy: -170 });
    }
  }

  collect(item) {
    if (item.kind === "shield") this.player.shieldT = SHIELD_TIME;
    else this.weapon = item.kind;
    this.score += 200;
    this.emit("pickup", { kind: item.kind, x: item.x + item.w / 2, y: item.y });
  }

  cleanup() {
    const left = this.camX - DESPAWN;
    const right = this.camX + VIEW_W + 220;
    this.enemies = this.enemies.filter((e) => {
      if (e.kind === "pod") return e.x < this.camX + VIEW_W + 30;
      return e.x + e.w > left && e.x < right && e.y < this.level.height + 32;
    });
    this.items = this.items.filter((item) => item.x + item.w > this.camX - 8 && item.y < this.level.height + 16);
  }
}
