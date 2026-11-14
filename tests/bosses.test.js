import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BEAM, BOSS_INTRO, BOSS_TYPES, createBoss, damageBoss } from "../src/core/bosses.js";
import { FLOOR_ROW, TILE } from "../src/core/constants.js";
import { Game } from "../src/core/game.js";
import { overlaps } from "../src/core/physics.js";
import { Player } from "../src/core/player.js";
import { STAGES } from "../src/core/stages.js";
import { enterArena, fightBoss } from "./support/bot.js";
import { idle, tick } from "./support/helpers.js";

const FLOOR = FLOOR_ROW * TILE;

function arenaGame(index, options = {}) {
  const game = new Game({ seed: 4, invincible: true, ...options });
  game.newGame(index);
  enterArena(game);
  return game;
}

describe("bosses", () => {
  it("cannot be hurt during the intro; damage is capped by the health left", () => {
    const arena = { left: 0, right: 320, top: 0, floor: FLOOR };
    const boss = createBoss("spider", arena);
    assert.equal(damageBoss(boss, 5), 0);
    boss.introT = 0;
    assert.equal(damageBoss(boss, 5), 5);
    boss.hp = 2;
    assert.equal(damageBoss(boss, 5), 2);
    assert.equal(boss.hp, 0);
  });

  it("the spider and the general enter phase 2 at half health, the gunship never", () => {
    const arena = { left: 0, right: 320, top: 0, floor: FLOOR };
    for (const id of Object.keys(BOSS_TYPES)) {
      const boss = createBoss(id, arena);
      boss.introT = 0;
      const events = [];
      damageBoss(boss, boss.maxHp / 2, { emit: (type) => events.push(type) });
      assert.equal(boss.phase, id === "gunship" ? 1 : 2, id);
      assert.equal(events.includes("phase"), id !== "gunship");
    }
  });

  for (const [index, stage] of STAGES.entries()) {
    it(`${stage.boss}: appears when the camera reaches the arena, stays inside it and uses several attacks`, () => {
      const game = arenaGame(index);
      assert.ok(game.boss, "boss spawned");
      assert.equal(game.camX, game.level.arenaX, "camera locked on the arena");
      const arena = game.arena;
      const kinds = new Set();
      for (let f = 0; f < 45 * 60; f += 1) {
        tick(game, idle);
        const b = game.boss;
        assert.ok(b.x >= arena.left - 0.01 && b.x + b.w <= arena.right + 0.01, `x ${b.x}`);
        assert.ok(b.y >= -1 && b.y + b.h <= arena.floor + 0.01, `y ${b.y}`);
        for (const s of game.enemyBullets) kinds.add(s.kind);
      }
      assert.ok(kinds.size >= 3, `attacks seen: ${[...kinds]}`);
    });
  }
});

describe("bosses can be beaten with the starting rifle (scripted bot)", () => {
  for (const [index, stage] of STAGES.entries()) {
    it(`${BOSS_TYPES[stage.boss].name}`, () => {
      const game = arenaGame(index);
      assert.equal(game.weapon, "rifle");
      const seconds = fightBoss(game, 150);
      assert.ok(seconds < 150, `took too long, boss hp ${game.boss.hp}/${game.boss.maxHp}`);
      assert.equal(game.state, "boss-dying");
      tick(game, idle, 60 * 3);
      assert.equal(game.state, stage.final ? "victory" : "clear");
    });
  }
});

describe("every boss attack has an answer", () => {
  const standing = () => new Player(100, FLOOR);
  const beam = (low) => ({ x: 0, y: FLOOR - (low ? BEAM.lowTop : BEAM.highTop), w: 320, h: low ? BEAM.lowH : BEAM.highH });

  it("the high beam hits a standing soldier but passes over a prone one", () => {
    const p = standing();
    assert.ok(overlaps(p.hurtbox, beam(false)));
    p.prone = true;
    assert.equal(overlaps(p.hurtbox, beam(false)), false);
  });

  it("the low beam hits standing and prone, but a jump clears it for its whole lifetime", () => {
    const p = standing();
    assert.ok(overlaps(p.hurtbox, beam(true)));
    p.prone = true;
    assert.ok(overlaps(p.hurtbox, beam(true)));
    // jump a few frames after the beam turns live and stay clear while it lasts
    const q = standing();
    q.onGround = true;
    const flat = { isSolid: (c, r) => r >= FLOOR_ROW, isLedge: () => false, tile: () => 0 };
    let clear = true;
    for (let f = 0; f < Math.ceil(BEAM.live * 60) + 4; f += 1) {
      q.update({ ...idle, jump: f === 0 }, flat, 1 / 60);
      if (f >= 3 && overlaps(q.hurtbox, beam(true))) clear = false;
    }
    assert.ok(clear, "a jump started just before the beam turns live clears it");
  });

  it("the boss intro lasts long enough to read its name", () => {
    assert.ok(BOSS_INTRO >= 1.5);
  });

  it("the general's shockwaves and the gunship's missiles can be dealt with", () => {
    const game = arenaGame(2);
    game.boss.turn = 1; // turn + 1 → pattern 2: stomp
    game.boss.state = "idle";
    game.boss.t = 10;
    let wave = null;
    for (let f = 0; f < 4 * 60 && !wave; f += 1) {
      tick(game, idle);
      wave = game.enemyBullets.find((b) => b.kind === "shock");
    }
    assert.ok(wave, "the stomp sends shockwaves");
    assert.ok(wave.h <= 12, "low enough to jump over");

    const air = arenaGame(1);
    air.boss.turn = 0; // turn + 1 → pattern 1: missiles
    air.boss.state = "idle";
    air.boss.t = 10;
    let missile = null;
    for (let f = 0; f < 3 * 60 && !missile; f += 1) {
      tick(air, idle);
      missile = air.enemyBullets.find((b) => b.kind === "missile");
    }
    assert.ok(missile?.shootable, "missiles can be shot down");
  });
});
