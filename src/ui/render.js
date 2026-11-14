/**
 * Canvas renderer. The world is 320 × 192 "pixels" drawn at an integer scale so everything
 * stays crisp. All art is procedural (rectangles, arcs and lines): there are no image files.
 */

import { BOSS_INTRO } from "../core/bosses.js";
import { TILE, VIEW_H, VIEW_W } from "../core/constants.js";
import { T_HAZARD, T_LEDGE, T_SOLID } from "../core/level.js";
import { ITEMS } from "../core/weapons.js";
import { HERO, ROBOT, THEMES } from "./themes.js";

// ------------------------------------------------------------------ particles

export class Particles {
  constructor() {
    this.items = [];
  }

  add(p) {
    this.items.push({ vx: 0, vy: 0, gravity: 0, size: 2, life: 0.5, age: 0, shape: "square", ...p });
  }

  burst(x, y, color, count = 10, speed = 90, extra = {}) {
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const s = speed * (0.5 + Math.random() * 0.7);
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, color, life: 0.3 + Math.random() * 0.3, size: 2 + Math.random() * 2, ...extra });
    }
  }

  /** A fiery explosion: flash ring, fire puffs and smoke. */
  explosion(x, y, size = 1) {
    this.add({ x, y, shape: "ring", color: "#fff3b0", size: 10 * size, life: 0.25 });
    this.burst(x, y, "#ffb02e", Math.round(10 * size), 80 * size, { shape: "puff", life: 0.4 });
    this.burst(x, y, "#ff5a14", Math.round(6 * size), 60 * size, { shape: "puff", life: 0.5 });
    this.burst(x, y, "rgba(60,60,60,0.8)", Math.round(4 * size), 30 * size, { shape: "puff", gravity: -40, life: 0.8 });
  }

  update(dt) {
    for (const p of this.items) {
      p.age += dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.items = this.items.filter((p) => p.age < p.life);
  }

  clear() {
    this.items = [];
  }
}

// ------------------------------------------------------------------ renderer

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  let scale = 1;
  let camX = 0;
  let shake = 0;

  function resize() {
    // size from the layout viewport, not the parent: the parent grows with the canvas itself
    const root = document.documentElement;
    const top = canvas.parentElement.getBoundingClientRect().top;
    const pad = 16;
    const box = { width: root.clientWidth - pad, height: root.clientHeight - top - pad };
    const dpr = window.devicePixelRatio || 1;
    const fit = Math.max(1, Math.min(box.width / VIEW_W, box.height / VIEW_H));
    scale = Math.max(1, Math.floor(fit * dpr));
    canvas.width = VIEW_W * scale;
    canvas.height = VIEW_H * scale;
    const cssScale = Math.min(box.width / VIEW_W, box.height / VIEW_H);
    canvas.style.width = `${Math.floor(VIEW_W * cssScale)}px`;
    canvas.style.height = `${Math.floor(VIEW_H * cssScale)}px`;
    ctx.imageSmoothingEnabled = false;
  }

  const sx = (x) => Math.round(x - camX);

  function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(sx(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function circle(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x - camX, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function line(x1, y1, x2, y2, color, width = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1 - camX, y1);
    ctx.lineTo(x2 - camX, y2);
    ctx.stroke();
  }

  /** Draw rectangles in a sprite's local space (facing right), mirrored when facing left. */
  function sprite(ox, oy, width, facing) {
    return (lx, ly, w, h, color) => {
      const x = facing >= 0 ? ox + lx : ox + width - lx - w;
      rect(x, oy + ly, w, h, color);
    };
  }

  const blink = (time, hz = 10) => Math.floor(time * hz) % 2 === 0;

  // ---------------------------------------------------------------- background

  function drawBackground(theme, id, time) {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, theme.sky[0]);
    g.addColorStop(0.65, theme.sky[1]);
    g.addColorStop(1, theme.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const far = camX * 0.15;
    const mid = camX * 0.4;

    if (id === "jungle") {
      // misty mountains, then a canopy of palms
      ctx.fillStyle = theme.far;
      ctx.beginPath();
      ctx.moveTo(0, VIEW_H);
      for (let x = 0; x <= VIEW_W; x += 8) {
        const wx = x + far;
        ctx.lineTo(x, 80 + Math.sin(wx * 0.021) * 18 + Math.sin(wx * 0.053) * 8);
      }
      ctx.lineTo(VIEW_W, VIEW_H);
      ctx.fill();
      ctx.fillStyle = theme.mist;
      ctx.fillRect(0, 96, VIEW_W, 26);
      const seed = Math.floor(mid / 60);
      for (let i = -1; i < 7; i += 1) {
        const x = Math.round(i * 60 - (mid % 60));
        palm(x + 20, 150, theme.mid, i + seed);
      }
      // undergrowth: a band of round bushes along the bottom
      ctx.fillStyle = theme.near;
      for (let i = -1; i < 16; i += 1) {
        const x = i * 24 - ((camX * 0.6) % 24);
        ctx.beginPath();
        ctx.arc(x, 156 + ((i + Math.floor(camX * 0.6 / 24)) % 3) * 3, 16, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillRect(0, 158, VIEW_W, 40);
    } else if (id === "dam") {
      // the dam wall with spillway stripes, searchlights sweeping the night
      for (let i = 0; i < 2; i += 1) {
        const a = Math.sin(time * 0.6 + i * 2) * 0.5 - Math.PI / 2;
        const bx = 80 + i * 170 - (far % 340);
        ctx.fillStyle = "rgba(255, 250, 200, 0.07)";
        ctx.beginPath();
        ctx.moveTo(bx, 130);
        ctx.lineTo(bx + Math.cos(a - 0.12) * 220, 130 + Math.sin(a - 0.12) * 220);
        ctx.lineTo(bx + Math.cos(a + 0.12) * 220, 130 + Math.sin(a + 0.12) * 220);
        ctx.fill();
      }
      ctx.fillStyle = theme.far;
      ctx.fillRect(0, 70, VIEW_W, 122);
      for (let i = -1; i < 12; i += 1) {
        const x = Math.round(i * 32 - (far % 32));
        ctx.fillStyle = "rgba(120, 170, 230, 0.18)";
        ctx.fillRect(x + 10, 78, 6, 114);
        ctx.fillStyle = theme.mid;
        ctx.fillRect(x, 70, 3, 122);
      }
      ctx.fillStyle = theme.mid;
      for (let i = -1; i < 5; i += 1) {
        const x = Math.round(i * 90 - (mid % 90));
        ctx.fillRect(x + 40, 60, 3, 100); // pylons
        ctx.fillRect(x + 30, 66, 23, 2);
        ctx.fillRect(x + 33, 76, 17, 2);
      }
      ctx.fillStyle = "#c9d6ff";
      for (let i = 0; i < 18; i += 1) {
        if ((i + Math.floor(time * 2)) % 7 === 0) continue; // stars twinkle
        ctx.fillRect((i * 53 + 17) % VIEW_W, (i * 29) % 60, 1, 1);
      }
    } else {
      // volcano silhouette with a glowing crater, steel towers, rising embers
      ctx.fillStyle = theme.far;
      ctx.beginPath();
      const vx = 200 - (far % 600);
      ctx.moveTo(vx - 160, VIEW_H);
      ctx.lineTo(vx - 30, 60);
      ctx.lineTo(vx + 30, 60);
      ctx.lineTo(vx + 160, VIEW_H);
      ctx.fill();
      ctx.fillStyle = blink(time, 3) ? "#ff7a2f" : "#ffb02e";
      ctx.fillRect(Math.round(vx - 28), 58, 56, 4);
      ctx.fillStyle = theme.mid;
      for (let i = -1; i < 6; i += 1) {
        const x = Math.round(i * 70 - (mid % 70));
        ctx.fillRect(x + 10, 90, 14, 102);
        ctx.fillRect(x + 6, 86, 22, 6);
        ctx.fillStyle = blink(time + i, 2) ? "#ff4d4d" : theme.mid;
        ctx.fillRect(x + 15, 82, 4, 4);
        ctx.fillStyle = theme.mid;
      }
      for (let i = 0; i < 14; i += 1) {
        const x = (i * 47 + time * 8 * ((i % 3) + 1)) % VIEW_W;
        const y = VIEW_H - ((time * 30 * ((i % 4) + 1) + i * 40) % VIEW_H);
        ctx.fillStyle = i % 2 ? "#ffb02e" : "#ff5a14";
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    }
  }

  function palm(x, base, color, seed) {
    const h = 50 + (((seed * 37) % 3) + 3) % 3 * 12;
    ctx.fillStyle = color;
    ctx.fillRect(x, base - h, 3, h + 10);
    for (const [dx, dy] of [[-14, 4], [-9, -2], [10, -2], [15, 4], [0, -5]]) {
      ctx.beginPath();
      ctx.moveTo(x + 1, base - h);
      ctx.quadraticCurveTo(x + dx / 2, base - h + dy - 6, x + dx, base - h + dy + 6);
      ctx.lineTo(x + 1, base - h + 3);
      ctx.fill();
    }
  }

  // ---------------------------------------------------------------- tiles

  function drawTiles(level, theme, id, time) {
    const first = Math.max(0, Math.floor(camX / TILE));
    const last = Math.min(level.cols - 1, Math.ceil((camX + VIEW_W) / TILE));
    for (let row = 0; row < level.rows; row += 1) {
      for (let col = first; col <= last; col += 1) {
        const t = level.tile(col, row);
        const x = col * TILE;
        const y = row * TILE;
        if (t === T_SOLID) solidTile(level, col, row, x, y, theme, id);
        else if (t === T_LEDGE) ledgeTile(x, y, theme, id, level.tile(col, row + 1) === T_HAZARD);
        else if (t === T_HAZARD) hazardTile(level, col, row, x, y, theme, id, time);
      }
    }
  }

  function solidTile(level, col, row, x, y, theme, id) {
    const open = level.tile(col, row - 1) !== T_SOLID && row > 0;
    rect(x, y, TILE, TILE, theme.ground);
    if (id === "jungle") {
      rect(x + ((col * 7) % 11), y + 6 + ((row * 5) % 7), 3, 2, theme.groundDark);
      rect(x + ((col * 3) % 9) + 4, y + 11, 2, 2, theme.groundDark);
      if (open) {
        rect(x, y, TILE, 4, theme.top);
        rect(x, y, TILE, 1, theme.topLight);
        rect(x + (col % 3) * 5, y + 4, 2, 2, theme.top);
      }
    } else if (id === "dam") {
      rect(x, y + TILE - 1, TILE, 1, theme.groundDark);
      rect(x + (row % 2 ? 8 : 0), y, 1, TILE, theme.groundDark);
      if (open) {
        for (let i = 0; i < 4; i += 1) rect(x + i * 4, y, 4, 3, i % 2 ? theme.topLight : theme.top);
      }
    } else {
      rect(x + 1, y + 1, TILE - 2, TILE - 2, theme.groundDark);
      rect(x + 2, y + 2, TILE - 4, TILE - 4, theme.ground);
      rect(x + 3, y + 3, 1, 1, theme.topLight);
      rect(x + 12, y + 3, 1, 1, theme.topLight);
      rect(x + 3, y + 12, 1, 1, theme.topLight);
      rect(x + 12, y + 12, 1, 1, theme.topLight);
      if (open) rect(x, y, TILE, 2, theme.top);
    }
  }

  function ledgeTile(x, y, theme, id) {
    if (id === "jungle") {
      rect(x, y, TILE, 5, theme.ledge);
      rect(x, y, TILE, 1, theme.ledgeLight);
      rect(x + 5, y + 1, 1, 4, theme.groundDark);
      rect(x + 12, y + 2, 1, 3, theme.groundDark);
    } else {
      rect(x, y, TILE, 2, theme.ledgeLight);
      rect(x, y + 2, TILE, 2, theme.ledge);
      for (let i = 0; i < 4; i += 1) rect(x + i * 4 + 1, y + 4, 1, 3, theme.ledge);
    }
  }

  function hazardTile(level, col, row, x, y, theme, id, time) {
    const [base, bright, dark] = theme.hazard;
    const surface = level.tile(col, row - 1) !== T_HAZARD;
    if (id === "jungle") {
      rect(x, y, TILE, TILE, base);
      if (surface) for (let i = 0; i < 4; i += 1) {
        const sx0 = x + i * 4 + 1;
        ctx.fillStyle = bright;
        ctx.beginPath();
        ctx.moveTo(sx(sx0), y + TILE);
        ctx.lineTo(sx(sx0 + 1), y + 2);
        ctx.lineTo(sx(sx0 + 2), y + TILE);
        ctx.fill();
        rect(sx0, y + 10, 2, 1, dark);
      }
    } else {
      rect(x, y, TILE, TILE, base);
      if (surface) {
        const wave = Math.round(Math.sin(time * 4 + x * 0.3) * 1.5);
        rect(x, y + 4 + wave, TILE, 3, bright);
        rect(x + ((time * 14 + x) % 14), y + 5 + wave, 2, 1, dark);
        if (id === "dam" && Math.floor(time * 12 + col) % 9 === 0) rect(x + 6, y + 1, 1, 5, dark); // spark
      }
    }
  }

  // ---------------------------------------------------------------- the commando

  function drawHero(p, game, time) {
    if (!p.alive) return drawCorpse(p, time);
    if (p.invulnT > 0 && blink(time, 16)) return;
    const C = HERO;
    const f = p.facing;
    if (p.prone) {
      const left = p.x - 4;
      const part = sprite(left, p.y + p.h - 8, 20, f);
      part(0, 4, 5, 4, C.boots);
      part(4, 3, 6, 5, C.pants);
      part(9, 2, 6, 6, C.vest);
      part(14, 1, 5, 5, C.skin);
      part(14, 0, 6, 3, C.helmet);
      part(10, 1, 3, 2, C.scarf);
      gun(p, C);
    } else if (p.spinning) {
      const cx = p.cx;
      const cy = p.cy + 2;
      const a = time * 18 * f;
      ctx.fillStyle = C.vest;
      ctx.beginPath();
      ctx.arc(cx - camX, cy, 6, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 4; i += 1) {
        const ang = a + (i * Math.PI) / 2;
        const color = [C.helmet, C.pants, C.boots, C.skin][i];
        circle(cx + Math.cos(ang) * 4, cy + Math.sin(ang) * 4, 2.5, color);
      }
      circle(cx + Math.cos(a + 0.6) * 6, cy + Math.sin(a + 0.6) * 6, 1.5, C.scarf);
    } else {
      const part = sprite(p.x, p.y, p.w, f);
      const running = p.onGround && Math.abs(p.vx) > 1;
      const step = running ? Math.floor(time * 10) % 4 : -1;
      const air = !p.onGround;
      // legs
      if (air) {
        part(1, 15, 4, 5, C.pants);
        part(7, 14, 4, 5, C.pants);
        part(0, 19, 5, 3, C.boots);
        part(7, 18, 5, 3, C.boots);
      } else {
        const a = step === 0 ? 2 : step === 2 ? -2 : 0;
        part(2 + a, 15, 4, 5, C.pants);
        part(6 - a, 15, 4, 5, C.pants);
        part(1 + a, 20, 5, 2, C.boots);
        part(6 - a, 20, 5, 2, C.boots);
      }
      // torso, head, scarf
      part(2, 8, 8, 8, C.vest);
      part(3, 9, 2, 5, C.vestLight);
      part(2, 14, 8, 1, C.boots); // belt
      part(3, 2, 7, 6, C.skin);
      part(2, 0, 9, 3, C.helmet);
      part(2, 0, 9, 1, C.helmetLight);
      part(8, 4, 2, 1, "#20160f"); // eye
      const flutter = Math.floor(time * 8) % 2;
      part(-2, 7 + flutter, 5, 2, C.scarf);
      part(2, 7, 6, 2, C.scarf);
      gun(p, C);
    }
    if (p.shieldT > 0 && (p.shieldT > 2 || blink(time, 8))) {
      ctx.strokeStyle = blink(time, 6) ? "#c48bff" : "#efe0ff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(p.cx - camX, p.cy, 11, 15, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** The rifle as a short thick line from the shoulder to the muzzle. */
  function gun(p, C) {
    const m = p.muzzle();
    const back = p.spinning ? 4 : 9;
    const sx0 = m.x - p.aim.x * back;
    const sy0 = m.y - p.aim.y * back;
    line(sx0, sy0, m.x, m.y, C.gun, 3);
    line(sx0 + p.aim.x * 2, sy0 + p.aim.y * 2 - 1, m.x - p.aim.x * 2, m.y - p.aim.y * 2 - 1, C.gunLight, 1);
  }

  function drawCorpse(p, time) {
    if (p.deadT > 1 && blink(time, 12)) return;
    const C = HERO;
    const part = sprite(p.x - 4, p.y + p.h - 8, 20, -p.facing);
    part(0, 4, 5, 4, C.boots);
    part(4, 3, 6, 5, C.pants);
    part(9, 2, 6, 6, C.vest);
    part(14, 1, 5, 5, C.skin);
    part(15, -1, 6, 3, C.helmet);
  }

  // ---------------------------------------------------------------- enemies

  function drawEnemy(e, game, time) {
    if (e.hidden) return;
    const R = ROBOT;
    const hit = e.flash > 0;
    const body = hit ? "#ffffff" : R.body;
    switch (e.kind) {
      case "runner":
      case "gunner": {
        const part = sprite(e.x, e.y, e.w, e.facing);
        const step = e.kind === "runner" && e.onGround ? Math.floor(time * 12) % 4 : -1;
        const a = step === 0 ? 2 : step === 2 ? -2 : 0;
        part(2 + a, 15, 3, 7, R.dark);
        part(7 - a, 15, 3, 7, R.dark);
        part(2, 7, 8, 9, body);
        part(3, 8, 6, 2, R.light);
        part(3, 0, 7, 7, body);
        part(6, 2, 4, 2, blink(time, 4) ? R.visor : "#ff9a9a");
        part(5, 6, 3, 1, R.dark);
        if (e.kind === "gunner") {
          const aim = e.aim ?? { x: e.facing, y: 0 };
          const ox = e.x + e.w / 2 + e.facing * 2;
          const oy = e.y + 9;
          line(ox, oy, ox + aim.x * 9, oy + aim.y * 9, R.gun, 3);
        } else {
          part(9, 9, 3, 2, R.dark); // arms pumping
        }
        break;
      }
      case "sniper": {
        const up = e.state === "up";
        if (up) {
          const rise = Math.min(1, e.t / 0.2);
          const top = e.y + 8 - rise * 8;
          rect(e.x + 3, top, 8, 8, body);
          rect(e.x + (e.facing > 0 ? 7 : 3), top + 2, 4, 2, R.visor);
          line(e.x + 7, top + 5, e.x + 7 + e.facing * 10, top + 5, R.gun, 2);
        }
        // bush in front
        circle(e.x + 3, e.y + 12, 5, "#2f6b2a");
        circle(e.x + 11, e.y + 12, 5, "#2f6b2a");
        circle(e.x + 7, e.y + 9, 5, "#3f8a34");
        rect(e.x - 1, e.y + 13, 16, 3, "#2f6b2a");
        break;
      }
      case "turret": {
        rect(e.x, e.y + 4, 16, 12, hit ? "#ffffff" : R.dark);
        rect(e.x + 1, e.y + 5, 14, 2, R.light);
        circle(e.x + 8, e.y + 8, 5, body);
        line(e.x + 8, e.y + 8, e.x + 8 + Math.cos(e.angle) * 11, e.y + 8 + Math.sin(e.angle) * 11, R.gun, 3);
        circle(e.x + 8, e.y + 8, 2, e.cd < 0.4 && blink(time, 12) ? "#ffffff" : R.visor);
        break;
      }
      case "mortar": {
        rect(e.x, e.y + 8, 16, 6, hit ? "#ffffff" : R.dark);
        rect(e.x + 2, e.y + 7, 12, 2, R.light);
        const tilt = e.facing * 0.5;
        line(e.x + 8, e.y + 9, e.x + 8 + Math.sin(tilt) * 9, e.y + 9 - Math.cos(tilt) * 9, body, 5);
        rect(e.x + 6, e.y + 10, 4, 2, R.visor);
        break;
      }
      case "drone": {
        rect(e.x + 1, e.y + 3, 12, 6, body);
        rect(e.x + 3, e.y + 4, 8, 1, R.light);
        circle(e.x + 7, e.y + 7, 2, R.visor);
        const spin = Math.floor(time * 30) % 2;
        rect(e.x - 2 + spin * 2, e.y, 8, 1, R.light);
        rect(e.x + 8 - spin * 2, e.y, 8, 1, R.light);
        rect(e.x + 6, e.y, 2, 3, R.dark);
        break;
      }
      case "crate": {
        const item = ITEMS[e.item];
        rect(e.x, e.y, 16, 16, hit ? "#ffffff" : "#7a5a32");
        rect(e.x + 1, e.y + 1, 14, 14, "#a07a44");
        rect(e.x + 1, e.y + 7, 14, 2, "#7a5a32");
        rect(e.x + 7, e.y + 1, 2, 14, "#7a5a32");
        rect(e.x + 5, e.y + 5, 6, 6, item?.color ?? "#ffffff");
        letter(item?.short ?? "?", e.x + 8, e.y + 10, "#1b1203");
        break;
      }
      case "pod": {
        const item = ITEMS[e.item];
        rect(e.x + 2, e.y + 2, 14, 8, hit ? "#ffffff" : "#c9d2e0");
        rect(e.x + 4, e.y + 3, 10, 6, item?.color ?? "#ffffff");
        letter(item?.short ?? "?", e.x + 9, e.y + 8, "#1b1203");
        const flap = Math.floor(time * 12) % 2;
        rect(e.x - 2, e.y + 3 - flap * 2, 4, 2, "#8a99ad");
        rect(e.x + 16, e.y + 3 - flap * 2, 4, 2, "#8a99ad");
        break;
      }
      default:
        rect(e.x, e.y, e.w, e.h, "#ff00ff");
    }
  }

  function letter(text, x, y, color) {
    ctx.fillStyle = color;
    ctx.font = "bold 7px monospace";
    ctx.textAlign = "center";
    ctx.fillText(text, Math.round(x - camX), Math.round(y));
    ctx.textAlign = "left";
  }

  // ---------------------------------------------------------------- bosses

  function drawBoss(b, game, time) {
    if (b.hp <= 0 && game.state === "boss-dying" && blink(time, 14)) return;
    const flash = b.flash > 0;
    const steel = flash ? "#ffffff" : "#5b6270";
    const dark = flash ? "#ffffff" : "#2c3038";
    const light = flash ? "#ffffff" : "#9aa3b5";
    const angry = b.phase === 2;
    if (b.introT > 0 && blink(time, 8)) ctx.globalAlpha = 0.6;
    if (b.id === "spider") {
      // four legs stepping, hull, turret with cannon, sensor eye
      const walk = Math.abs(b.vx) > 1 ? Math.floor(time * 10) % 2 : 0;
      for (let i = 0; i < 4; i += 1) {
        const lx = b.x + 6 + i * 16;
        const lift = (i + walk) % 2 ? 3 : 0;
        line(lx + 4, b.y + 22, lx - 2, b.y + 30 - lift, dark, 3);
        line(lx - 2, b.y + 30 - lift, lx, b.y + b.h, dark, 3);
      }
      rect(b.x + 4, b.y + 12, b.w - 8, 14, steel);
      rect(b.x + 4, b.y + 12, b.w - 8, 2, light);
      for (let i = 0; i < 5; i += 1) rect(b.x + 8 + i * 11, b.y + 18, 6, 2, dark);
      rect(b.x + 16, b.y + 2, 24, 11, steel);
      rect(b.x + 16, b.y + 2, 24, 2, light);
      line(b.x + 18, b.y + 6, b.x + 2, b.y + 2, dark, 4); // cannon
      rect(b.x + 6, b.y + 20, 6, 4, dark); // machine gun
      circle(b.x + 34, b.y + 7, 3, angry && blink(time, 6) ? "#ffffff" : "#ff3b3b");
      if (angry) smoke(b.x + 46, b.y + 10, time);
    } else if (b.id === "gunship") {
      const rotor = Math.floor(time * 30) % 2;
      rect(b.x + 8 + rotor * 6, b.y - 4, b.w - 16, 2, light);
      rect(b.x + 34, b.y - 3, 4, 5, dark);
      rect(b.x + 14, b.y + 2, 44, 16, steel);
      rect(b.x + 14, b.y + 2, 44, 2, light);
      rect(b.x + 58, b.y + 6, 14, 5, steel); // tail boom
      rect(b.x + 68, b.y, 3, 12, dark);
      rect(b.x + 4, b.y + 6, 12, 10, steel); // nose
      rect(b.x + 5, b.y + 7, 8, 5, flash ? "#ffffff" : "#5ff2ff");
      rect(b.x + 18, b.y + 18, 36, 4, dark); // skids & gun pods
      rect(b.x + 14, b.y + 22, 8, 4, dark);
      rect(b.x + 50, b.y + 22, 8, 4, dark);
      circle(b.x + 36, b.y + 20, 2, blink(time, 5) ? "#ff3b3b" : "#7a1010");
      if (b.hp < b.maxHp / 3) smoke(b.x + 60, b.y + 4, time);
    } else {
      // the general: legs, torso, shoulder rocket pods, visor, arm cannon
      const glow = angry && blink(time, 6) ? "#ff3b3b" : "#ffb02e";
      rect(b.x + 6, b.y + 44, 10, 24, dark);
      rect(b.x + 24, b.y + 44, 10, 24, dark);
      rect(b.x + 3, b.y + 62, 15, 6, steel);
      rect(b.x + 22, b.y + 62, 15, 6, steel);
      rect(b.x + 4, b.y + 18, 32, 28, steel);
      rect(b.x + 4, b.y + 18, 32, 2, light);
      rect(b.x + 14, b.y + 26, 12, 10, dark);
      circle(b.x + 20, b.y + 31, 3, glow); // reactor core
      rect(b.x - 2, b.y + 8, 14, 12, steel); // rocket pods
      rect(b.x + 28, b.y + 8, 14, 12, steel);
      for (let i = 0; i < 3; i += 1) rect(b.x + i * 4, b.y + 10, 2, 2, dark);
      rect(b.x + 12, b.y + 2, 16, 14, steel); // head
      rect(b.x + 13, b.y + 7, 14, 3, glow);
      rect(b.x - 8, b.y + 30, 14, 6, dark); // arm cannon
      rect(b.x - 10, b.y + 31, 4, 4, steel);
      if (b.state === "beam") circle(b.x - 9, b.y + 33, 3 + (blink(time, 20) ? 1 : 0), "#ff5ad9");
      if (angry) smoke(b.x + 34, b.y + 20, time);
    }
    ctx.globalAlpha = 1;
  }

  function smoke(x, y, time) {
    for (let i = 0; i < 3; i += 1) {
      const t = (time * 0.8 + i / 3) % 1;
      ctx.globalAlpha = 0.5 * (1 - t);
      circle(x + Math.sin(t * 6 + i) * 3, y - t * 22, 2 + t * 4, "#3a3a3a");
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- shots & items

  function drawPlayerBullet(b, time) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    switch (b.kind) {
      case "spread":
        circle(cx, cy, 3, "#ff6b6b");
        circle(cx, cy, 1.5, "#ffe0e0");
        break;
      case "rapid":
        rect(cx - 2, cy - 1, 4, 2, "#7ee787");
        rect(cx - 1, cy - 2, 2, 4, "#e0ffe0");
        break;
      case "laser": {
        const len = Math.hypot(b.vx, b.vy) || 1;
        const dx = (b.vx / len) * 12;
        const dy = (b.vy / len) * 12;
        line(cx - dx, cy - dy, cx + dx, cy + dy, blink(time, 20) ? "#5ff2ff" : "#b5fbff", 3);
        line(cx - dx * 0.7, cy - dy * 0.7, cx + dx * 0.7, cy + dy * 0.7, "#ffffff", 1);
        break;
      }
      case "homing": {
        const len = Math.hypot(b.vx, b.vy) || 1;
        line(cx - (b.vx / len) * 6, cy - (b.vy / len) * 6, cx, cy, "#ffb02e", 3);
        circle(cx, cy, 2, "#fff3b0");
        circle(cx - (b.vx / len) * 8, cy - (b.vy / len) * 8, 1.5, "#ff5a14");
        break;
      }
      default:
        rect(cx - 2, cy - 2, 4, 4, "#ffe27a");
        rect(cx - 1, cy - 1, 2, 2, "#ffffff");
    }
  }

  function drawEnemyBullet(b, game, time) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    switch (b.kind) {
      case "beam":
        if (b.warnT > 0) {
          if (blink(time, 14)) {
            ctx.setLineDash([4, 3]);
            line(b.x, cy, b.x + b.w, cy, "#ff5ad9", 1);
            ctx.setLineDash([]);
          }
          ctx.fillStyle = "#ff5ad9";
          ctx.font = "bold 7px monospace";
          ctx.fillText(b.low ? "▲ NHẢY" : "▼ NẰM", Math.round(cx - camX) - 14, Math.round(b.y) - 4);
        } else {
          rect(b.x, b.y, b.w, b.h, blink(time, 30) ? "#ff5ad9" : "#ffb3f0");
          rect(b.x, cy - 1, b.w, 2, "#ffffff");
        }
        break;
      case "shock":
        for (let i = 0; i < 3; i += 1) {
          const h = 4 + ((Math.floor(time * 20) + i) % 3) * 3;
          rect(b.x + i * 4, b.y + b.h - h, 4, h, i % 2 ? "#ffb02e" : "#fff3b0");
        }
        break;
      case "blast":
        circle(cx, cy, 7 + (blink(time, 20) ? 1 : 0), "#ff7a2f");
        circle(cx, cy, 4, "#fff3b0");
        break;
      case "shell":
      case "bomb":
        circle(cx, cy, 4, "#2c3038");
        circle(cx - 1, cy - 1, 1.5, "#9aa3b5");
        if (b.kind === "bomb") rect(cx - 1, b.y - 2, 2, 3, "#5b6270");
        break;
      case "rocket":
      case "missile": {
        const len = Math.hypot(b.vx, b.vy) || 1;
        line(cx - (b.vx / len) * 5, cy - (b.vy / len) * 5, cx + (b.vx / len) * 4, cy + (b.vy / len) * 4, "#e8e8e8", 3);
        circle(cx + (b.vx / len) * 4, cy + (b.vy / len) * 4, 1.5, "#ff3b3b");
        circle(cx - (b.vx / len) * 7, cy - (b.vy / len) * 7, 2, blink(time, 20) ? "#ffb02e" : "#ff5a14");
        break;
      }
      default:
        circle(cx, cy, 3, blink(time, 16) ? "#ff6a3d" : "#ff3b8a");
        circle(cx, cy, 1.5, "#ffe0c2");
    }
  }

  function drawItem(item, time) {
    const info = ITEMS[item.kind];
    const bob = item.vy === 0 ? Math.round(Math.sin(time * 5) * 1) : 0;
    const x = item.x;
    const y = item.y + bob;
    rect(x, y + 1, 14, 10, "#1b1203");
    rect(x + 1, y, 12, 12, "#1b1203");
    rect(x + 1, y + 1, 12, 10, blink(time, 6) ? info.color : "#ffffff");
    rect(x - 3, y + 4, 3, 2, "#c9d2e0");
    rect(x + 14, y + 4, 3, 2, "#c9d2e0");
    letter(info.short, x + 7, y + 9, "#1b1203");
  }

  function drawCheckpoint(cp, active, theme, time) {
    rect(cp.x - 1, cp.y - 26, 2, 26, "#c9d2e0");
    const color = active ? (blink(time, 3) ? "#7ee787" : "#c4ffc8") : "#6b7280";
    rect(cp.x + 1, cp.y - 26, 10, 7, color);
    rect(cp.x + 3, cp.y - 24, 2, 3, theme.groundDark);
  }

  function drawParticles(particles) {
    for (const p of particles.items) {
      const t = p.age / p.life;
      ctx.globalAlpha = Math.max(0, 1 - t);
      if (p.shape === "ring") {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x - camX, p.y, p.size * (0.3 + t), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.shape === "puff") {
        circle(p.x, p.y, p.size * (0.6 + t), p.color);
      } else if (p.shape === "text") {
        ctx.fillStyle = p.color;
        ctx.font = "bold 8px monospace";
        ctx.textAlign = "center";
        ctx.fillText(p.text, Math.round(p.x - camX), Math.round(p.y));
        ctx.textAlign = "left";
      } else {
        rect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size, p.color);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- overlays on the canvas

  function banner(lines) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 70, VIEW_W, 46);
    ctx.textAlign = "center";
    lines.forEach(([text, color, size], i) => {
      ctx.font = `bold ${size}px monospace`;
      ctx.fillStyle = "#000";
      ctx.fillText(text, VIEW_W / 2 + 1, 88 + i * 18 + 1);
      ctx.fillStyle = color;
      ctx.fillText(text, VIEW_W / 2, 88 + i * 18);
    });
    ctx.textAlign = "left";
  }

  // ---------------------------------------------------------------- frame

  function draw(game, particles, time, dt = 1 / 60) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (!game.level) {
      camX = time * 20; // the title screen: the jungle scrolls by behind the menu
      drawBackground(THEMES.jungle, "jungle", time);
      return;
    }
    shake = Math.max(0, shake - dt);
    const theme = THEMES[game.stage.theme];
    const jitter = shake > 0 ? (Math.random() - 0.5) * 4 * Math.min(1, shake * 4) : 0;
    camX = Math.round(game.camX + jitter);
    drawBackground(theme, game.stage.theme, time);
    drawTiles(game.level, theme, game.stage.theme, time);
    game.level.checkpoints.forEach((cp, i) => drawCheckpoint(cp, i <= game.checkpoint, theme, time));
    for (const item of game.items) drawItem(item, time);
    for (const e of game.enemies) drawEnemy(e, game, time);
    if (game.boss && (game.boss.hp > 0 || game.state === "boss-dying")) drawBoss(game.boss, game, time);
    if (game.player) drawHero(game.player, game, time);
    for (const b of game.bullets) drawPlayerBullet(b, time);
    for (const b of game.enemyBullets) drawEnemyBullet(b, game, time);
    drawParticles(particles);

    const boss = game.boss;
    if (game.state === "intro") {
      banner([[`MÀN ${game.stageIndex + 1}`, theme.accent, 9], [game.stage.name.toUpperCase(), "#ffffff", 12]]);
    } else if (boss && boss.introT > 0 && boss.introT < BOSS_INTRO && blink(time, 4)) {
      banner([["⚠ CẢNH BÁO ⚠", "#ff4d4d", 10], [boss.name.toUpperCase(), "#ffffff", 11]]);
    }
  }

  return {
    resize,
    draw,
    shake(seconds) {
      shake = Math.max(shake, seconds);
    },
  };
}
