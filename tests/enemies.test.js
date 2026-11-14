import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DT, VIEW_W } from "../src/core/constants.js";
import { aim8, createEnemy, isDangerous, isHittable, SQUAD_MAX, updateEnemy } from "../src/core/enemies.js";
import { levelFrom, standingPlayer } from "./support/helpers.js";

const FLOOR = 11 * 16;

/** The slice of Game that enemies use. */
function world(rows = ["........................", "########################"]) {
  const level = levelFrom(rows);
  const shots = [];
  const events = [];
  const w = {
    level,
    player: standingPlayer(level, 2),
    camX: 0,
    time: 0,
    enemies: [],
    shots,
    events,
    enemyShot: (b) => shots.push({ gravity: 0, ...b }),
    spawnEnemy: (e) => w.enemies.push(e),
    emit: (type, data) => events.push({ type, ...data }),
  };
  return w;
}

function step(w, e, seconds) {
  for (let f = 0; f < Math.ceil(seconds * 60); f += 1) {
    updateEnemy(e, w, DT);
    w.time += DT;
  }
}

describe("enemies", () => {
  it("aim8 snaps to the nearest of 8 directions", () => {
    const right = aim8(0, 0, 100, 10);
    assert.ok(Math.abs(right.x - 1) < 1e-9 && Math.abs(right.y) < 1e-9);
    const diag = aim8(0, 0, -50, -60);
    assert.ok(diag.x < 0 && diag.y < 0 && Math.abs(Math.abs(diag.x) - Math.abs(diag.y)) < 1e-9);
  });

  it("a gunner faces the player and fires aimed shots on a timer", () => {
    const w = world();
    const g = createEnemy("gunner", 200, FLOOR);
    step(w, g, 0.7);
    assert.equal(w.shots.length, 0, "a short delay before the first shot");
    step(w, g, 0.2);
    assert.equal(w.shots.length, 1);
    assert.equal(g.facing, -1);
    assert.ok(w.shots[0].vx < 0 && Math.abs(w.shots[0].vy) < 1e-6, "straight at a player on the same level");
    step(w, g, 1.7);
    assert.equal(w.shots.length, 2);
  });

  it("a standing gunner's shot flies over a prone player", () => {
    const w = world();
    const g = createEnemy("gunner", 200, FLOOR);
    step(w, g, 0.9);
    const shot = w.shots[0];
    w.player.prone = true;
    const hb = w.player.hurtbox;
    assert.ok(shot.y + shot.h <= hb.y, `shot bottom ${shot.y + shot.h} vs prone top ${hb.y}`);
  });

  it("a sniper cannot be hit or hurt you while hidden, then pops up and fires once", () => {
    const w = world();
    const s = createEnemy("sniper", 200, FLOOR);
    assert.equal(isHittable(s), false);
    assert.equal(isDangerous(s), false);
    step(w, s, 1.9);
    assert.equal(s.state, "up");
    assert.ok(isHittable(s));
    step(w, s, 0.6);
    assert.equal(w.shots.length, 1);
    step(w, s, 0.8);
    assert.equal(s.state, "idle");
    assert.equal(w.shots.length, 1);
  });

  it("a turret turns toward the player in steps before firing", () => {
    const w = world();
    const t = createEnemy("turret", 120, FLOOR - 48);
    w.player.x = 200; // to the right and below: the barrel starts pointing left
    step(w, t, 3);
    const want = Math.atan2(w.player.cy - (t.y + 8), w.player.cx - (t.x + 8));
    let diff = Math.abs(t.angle - want) % (Math.PI * 2);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    assert.ok(diff <= Math.PI / 12 + 1e-9, `off by ${diff}`);
    assert.ok(w.shots.length >= 1);
  });

  it("a mortar shell lands where the player stands", () => {
    const w = world();
    const m = createEnemy("mortar", 300, FLOOR);
    step(w, m, 0.9);
    const shell = w.shots[0];
    assert.ok(shell.explode);
    let { x, y, vy } = shell;
    for (let f = 0; f < 600 && y + shell.h / 2 < FLOOR - 1; f += 1) {
      vy += shell.gravity * DT;
      x += shell.vx * DT;
      y += vy * DT;
    }
    assert.ok(Math.abs(x + shell.w / 2 - w.player.cx) < 12, `landed at ${x}, player at ${w.player.cx}`);
  });

  it("a runner charges, hops a step and walks off ledges", () => {
    const w = world(["........................", "..................#.....", "###...##################"]);
    const r = createEnemy("runner", 360, FLOOR);
    r.facing = -1;
    step(w, r, 2);
    assert.ok(r.x < 18 * 16 && r.y < w.level.height, `got past the step: ${r.x}`);
    step(w, r, 5);
    assert.ok(r.y > w.level.height, "and ran into the pit");
  });

  it("a squad sends runners from the right edge while ahead, at most a few at a time", () => {
    const w = world();
    const squad = createEnemy("squad", VIEW_W + 40, FLOOR, { id: 7 });
    step(w, squad, 20);
    const runners = w.enemies.filter((e) => e.squadId === 7);
    assert.equal(runners.length, SQUAD_MAX);
    assert.ok(runners.every((r) => r.x >= VIEW_W));
    w.camX = squad.x + 10; // passed it
    runners.forEach((r) => (r.hp = 0));
    step(w, squad, 5);
    assert.equal(w.enemies.length, SQUAD_MAX, "no more once the camera has gone past");
  });

  it("drones drift toward the player's height; crates and pods are harmless", () => {
    const w = world();
    const d = createEnemy("drone", 300, 40);
    const y0 = d.baseY;
    step(w, d, 3);
    assert.ok(d.baseY > y0);
    assert.ok(d.x < 300);
    assert.equal(isDangerous(createEnemy("crate", 100, FLOOR)), false);
    assert.equal(isDangerous(createEnemy("pod", 100, 40)), false);
    assert.ok(isHittable(createEnemy("pod", 100, 40)));
  });
});
