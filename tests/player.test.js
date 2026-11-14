import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { overlaps } from "../src/core/physics.js";
import { PLAYER } from "../src/core/player.js";
import { idle, levelFrom, press, run, standingPlayer } from "./support/helpers.js";

const flat = () => levelFrom(["....................", "####################"]);
const D = Math.SQRT1_2;

describe("movement", () => {
  it("runs at a fixed speed and stops at once", () => {
    const level = flat();
    const p = standingPlayer(level, 5);
    const x = p.x;
    run(p, level, press({ right: true }), 60);
    assert.ok(Math.abs(p.x - x - PLAYER.run) < 2, `ran ${p.x - x}`);
    const stop = p.x;
    run(p, level, idle, 1);
    assert.ok(Math.abs(p.x - stop) < 0.01);
  });

  it("the jump is a fixed ~60 px spin with air control, landing where it started", () => {
    const level = flat();
    const p = standingPlayer(level, 5);
    const ground = p.y;
    let top = p.y;
    let spun = false;
    const actions = run(p, level, (f) => {
      top = Math.min(top, p.y);
      spun ||= p.spinning;
      return press({ jump: f === 0 });
    }, 60);
    assert.ok(spun);
    assert.ok(ground - top > 55 && ground - top < 64, `height ${ground - top}`);
    assert.equal(p.y, ground);
    assert.equal(p.spinning, false);
    assert.deepEqual(actions.map((a) => a.type), ["jump", "land"]);
  });

  it("holding jump does not jump again", () => {
    const level = flat();
    const p = standingPlayer(level, 5);
    const actions = run(p, level, press({ jump: true }), 120);
    assert.equal(actions.filter((a) => a.type === "jump").length, 1);
  });

  it("↓ on the ground goes prone and stops; ↓ + direction keeps running", () => {
    const level = flat();
    const p = standingPlayer(level, 5);
    run(p, level, press({ down: true }), 2);
    assert.ok(p.prone);
    assert.equal(p.vx, 0);
    run(p, level, press({ down: true, right: true }), 2);
    assert.equal(p.prone, false);
    assert.ok(p.vx > 0);
  });

  it("↓ + jump drops through a ledge but not through solid ground", () => {
    const level = levelFrom(["..........", "====......", "..........", "..........", "##########"]);
    const p = standingPlayer(level, 1, 8);
    run(p, level, idle, 2);
    assert.ok(p.onGround);
    const actions = run(p, level, (f) => press({ down: true, jump: f === 0 }), 40);
    assert.ok(actions.some((a) => a.type === "drop"));
    assert.equal(p.y + p.h, 11 * 16, "landed on the floor below");
    const jumps = run(p, level, (f) => press({ down: true, jump: f === 0 }), 2);
    assert.ok(jumps.some((a) => a.type === "jump"), "solid ground: it is an ordinary jump");
  });

  it("jumps up through a ledge and lands on it", () => {
    const level = levelFrom(["..........", "..====....", "..........", "..........", "##########"]);
    const p = standingPlayer(level, 3);
    run(p, level, (f) => press({ jump: f === 0 }), 60);
    assert.equal(p.y + p.h, 8 * 16);
  });
});

describe("8-way aim", () => {
  const cases = [
    ["facing right", {}, { x: 1, y: 0 }],
    ["up", { up: true }, { x: 0, y: -1 }],
    ["up + right", { up: true, right: true }, { x: D, y: -D }],
    ["down + right (running)", { down: true, right: true }, { x: D, y: D }],
    ["prone", { down: true }, { x: 1, y: 0 }],
  ];
  for (const [name, held, want] of cases) {
    it(name, () => {
      const level = flat();
      const p = standingPlayer(level, 5);
      run(p, level, press(held), 2);
      assert.ok(Math.abs(p.aim.x - want.x) < 1e-9 && Math.abs(p.aim.y - want.y) < 1e-9, JSON.stringify(p.aim));
    });
  }

  it("in the air ↓ aims straight down and left aims left", () => {
    const level = flat();
    const p = standingPlayer(level, 5);
    run(p, level, (f) => press({ jump: f === 0 }), 10);
    run(p, level, press({ down: true }), 1);
    assert.deepEqual(p.aim, { x: 0, y: 1 });
    run(p, level, press({ left: true }), 1);
    assert.deepEqual(p.aim, { x: -1, y: 0 });
  });

  it("the muzzle sits on the side and height of the aim", () => {
    const level = flat();
    const p = standingPlayer(level, 5);
    run(p, level, press({ up: true }), 1);
    assert.ok(p.muzzle().y < p.y);
    run(p, level, press({ down: true }), 1);
    assert.ok(p.muzzle().y > p.y + p.h - 8 && p.muzzle().x > p.x + p.w);
    run(p, level, press({ left: true }), 1);
    assert.ok(p.muzzle().x < p.x);
  });
});

describe("hurtbox", () => {
  it("prone is low enough for chest-high shots to pass overhead", () => {
    const level = flat();
    const p = standingPlayer(level, 5);
    const chest = { x: p.x - 20, y: p.y + 6, w: 60, h: 6 };
    assert.ok(overlaps(p.hurtbox, chest));
    run(p, level, press({ down: true }), 1);
    assert.equal(overlaps(p.hurtbox, chest), false);
  });

  it("the spin jump curls the hurtbox up", () => {
    const level = flat();
    const p = standingPlayer(level, 5);
    const standing = p.hurtbox.h;
    run(p, level, (f) => press({ jump: f === 0 }), 5);
    assert.ok(p.hurtbox.h < standing);
  });

  it("is safe while invulnerable or shielded", () => {
    const p = standingPlayer(flat(), 5);
    assert.equal(p.safe, false);
    p.shieldT = 1;
    assert.ok(p.safe);
  });
});
