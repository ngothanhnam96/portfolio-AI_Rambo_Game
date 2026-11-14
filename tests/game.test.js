import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEnemy } from "../src/core/enemies.js";
import { BOSS_SCORE, CONTINUES, DYING_TIME, EXTRA_LIFE_EVERY, Game, INTRO_TIME, START_LIVES } from "../src/core/game.js";
import { mulberry32 } from "../src/core/rng.js";
import { STAGES } from "../src/core/stages.js";
import { SHIELD_TIME, WEAPONS } from "../src/core/weapons.js";
import { idle, press, seconds, tick } from "./support/helpers.js";

/** A game in the first stage, past the intro, with the level emptied of enemies. */
function playing({ stage = 0, ...options } = {}) {
  const game = new Game({ seed: 9, ...options });
  game.newGame(stage);
  tick(game, idle, seconds(INTRO_TIME) + 1);
  for (const m of game.markers) m.used = true;
  game.enemies = [];
  return game;
}

/** An enemy right in front of the player (or `dx` px away). */
function enemyAt(game, kind = "gunner", dx = 30, extra = {}) {
  const p = game.player;
  const e = createEnemy(kind, p.cx + dx, p.y + p.h, extra);
  game.enemies.push(e);
  return e;
}

describe("flow", () => {
  it("title → intro → playing, with the stage name event", () => {
    const game = new Game({ seed: 1 });
    assert.equal(game.state, "title");
    game.newGame();
    assert.equal(game.state, "intro");
    assert.ok(game.takeEvents().some((e) => e.type === "stage-start" && e.stage === "jungle"));
    tick(game, press({ right: true, shoot: true }), seconds(INTRO_TIME) - 5);
    assert.equal(game.bullets.length, 0, "no input during the intro");
    tick(game, idle, 6);
    assert.equal(game.state, "playing");
    assert.equal(game.lives, START_LIVES);
  });

  it("pauses and resumes", () => {
    const game = playing();
    assert.equal(game.togglePause(), "paused");
    const x = game.player.x;
    tick(game, press({ right: true }), 30);
    assert.equal(game.player.x, x);
    assert.equal(game.togglePause(), "playing");
  });

  it("the camera only scrolls forward and the player cannot leave the screen", () => {
    const game = playing();
    tick(game, press({ right: true }), 150);
    const cam = game.camX;
    assert.ok(cam > 0);
    tick(game, press({ left: true }), 400);
    assert.equal(game.camX, cam);
    assert.equal(game.player.x, cam, "stopped at the left edge");
  });

  it("clear → next stage → … → victory after the last boss", () => {
    const game = playing({ invincible: true });
    game.state = "clear";
    assert.ok(game.nextStage());
    assert.equal(game.stage.id, "dam");
    assert.equal(game.state, "intro");
    game.stageIndex = STAGES.length - 1;
    game.stage = STAGES.at(-1);
    game.boss = { x: 0, y: 0, w: 1, h: 1 };
    game.defeatBoss();
    assert.equal(game.state, "boss-dying");
    assert.equal(game.nextStage(), false);
    tick(game, idle, seconds(3));
    assert.equal(game.state, "victory");
  });
});

describe("shooting", () => {
  it("holding fire shoots automatically at the weapon's rate", () => {
    const game = playing();
    tick(game, press({ shoot: true }), 60);
    const shots = game.takeEvents().filter((e) => e.type === "shoot").length;
    // the rate is the ceiling; the cap of bullets on screen is what slows long-range fire
    assert.ok(shots >= WEAPONS.rifle.max && shots <= 1 / WEAPONS.rifle.rate + 1, `${shots} shots in 1 s`);
    const close = playing();
    const wall = enemyAt(close, "crate", 24, { hp: 999 });
    tick(close, press({ shoot: true }), 60);
    const fast = close.takeEvents().filter((e) => e.type === "shoot").length;
    assert.ok(fast >= 1 / WEAPONS.rifle.rate - 1 && wall.hp < 999, `${fast} shots in 1 s at point blank`);
  });

  it("each weapon caps its bullets on screen; the spread fires five at once", () => {
    const game = playing();
    game.weapon = "spread";
    tick(game, press({ shoot: true }));
    assert.equal(game.bullets.length, 5);
    tick(game, press({ shoot: true }), 120);
    assert.ok(game.bullets.length <= WEAPONS.spread.max);
    const laser = playing();
    laser.weapon = "laser";
    tick(laser, press({ shoot: true }), 120);
    assert.ok(laser.bullets.length <= WEAPONS.laser.max);
  });

  it("bullets fly in the aimed direction", () => {
    const game = playing();
    tick(game, press({ up: true, shoot: true }));
    assert.ok(game.bullets[0].vy < 0 && Math.abs(game.bullets[0].vx) < 1e-9);
  });

  it("kills score points; the laser pierces, the rifle does not", () => {
    const game = playing();
    const a = enemyAt(game, "runner", 30);
    const b = enemyAt(game, "runner", 50);
    a.facing = b.facing = 0;
    tick(game, press({ shoot: true }), 20);
    assert.equal(a.hp, 0);
    assert.ok(game.score >= a.score);

    const beam = playing();
    beam.weapon = "laser";
    const c = enemyAt(beam, "gunner", 40, { hp: 3 });
    const d = enemyAt(beam, "gunner", 60, { hp: 3 });
    c.hp = d.hp = 3;
    c.cd = d.cd = 99;
    tick(beam, press({ shoot: true }), 6);
    assert.equal(c.hp, 0);
    assert.equal(d.hp, 0, "one laser shot went through both");
  });

  it("homing bullets curve toward a target", () => {
    const game = playing();
    game.weapon = "homing";
    const e = enemyAt(game, "gunner", 60);
    e.y -= 40;
    e.cd = 99;
    tick(game, press({ shoot: true }), 4);
    tick(game, idle, 10);
    assert.ok(game.bullets.some((b) => b.vy < 0) || e.hp <= 0);
  });
});

describe("death and lives", () => {
  it("one hit kills: a life and the weapon are lost, then you fall back in, briefly invulnerable", () => {
    const game = playing();
    game.weapon = "spread";
    const p = game.player;
    game.enemyShot({ kind: "pellet", x: p.x, y: p.y + 6, w: 6, h: 6, vx: 0, vy: 0 });
    tick(game, idle);
    assert.equal(game.state, "dying");
    assert.equal(game.weapon, "rifle");
    tick(game, idle, seconds(DYING_TIME) + 1);
    assert.equal(game.state, "playing");
    assert.equal(game.lives, START_LIVES - 1);
    assert.ok(game.player.alive && game.player.y < 40, "drops in from the top");
    assert.ok(game.player.safe);
    tick(game, idle, 90);
    assert.ok(game.player.onGround, "lands on safe ground");
  });

  it("prone dodges a chest-high shot; a shield blocks everything for a while", () => {
    const game = playing();
    const p = game.player;
    tick(game, press({ down: true }));
    game.enemyShot({ kind: "pellet", x: p.x - 30, y: p.y + 6, w: 6, h: 6, vx: 100, vy: 0 });
    tick(game, press({ down: true }), 40);
    assert.equal(game.state, "playing");

    p.shieldT = SHIELD_TIME;
    game.enemyShot({ kind: "pellet", x: p.x, y: p.y + 6, w: 6, h: 6, vx: 0, vy: 0 });
    tick(game, idle);
    assert.equal(game.state, "playing");
  });

  it("falling into a pit kills", () => {
    const game = playing();
    game.player.y = game.level.height + 20;
    tick(game, idle);
    assert.equal(game.state, "dying");
  });

  it("losing the last life is game over; continuing resets the score and restarts at the checkpoint", () => {
    const game = playing();
    game.lives = 1;
    game.score = 4321;
    game.checkpoint = 0;
    game.killPlayer();
    tick(game, idle, seconds(DYING_TIME) + 1);
    assert.equal(game.state, "game-over");
    assert.ok(game.continueGame());
    assert.equal(game.score, 0);
    assert.equal(game.lives, START_LIVES);
    assert.equal(game.continues, CONTINUES - 1);
    assert.equal(Math.round(game.player.cx), game.level.checkpoints[0].x);
    game.continues = 0;
    game.state = "game-over";
    assert.equal(game.continueGame(), false);
  });

  it("an extra life every 20 000 points", () => {
    const game = playing();
    game.score = EXTRA_LIFE_EVERY * 2 + 5;
    tick(game, idle);
    assert.equal(game.lives, START_LIVES + 2);
    tick(game, idle);
    assert.equal(game.lives, START_LIVES + 2);
  });
});

describe("supplies", () => {
  it("a crate breaks open; its item falls and changes the weapon", () => {
    const game = playing();
    const crate = enemyAt(game, "crate", 30, { item: "laser" });
    tick(game, press({ shoot: true }), 40);
    assert.equal(crate.hp <= 0, true);
    assert.equal(game.items.length, 1);
    tick(game, idle, 40);
    assert.ok(game.items[0].vy === 0, "landed");
    tick(game, press({ right: true }), 40);
    assert.equal(game.weapon, "laser");
    assert.ok(game.takeEvents().some((e) => e.type === "pickup"));
  });

  it("pods fly in from the left once the camera is halfway to their marker", () => {
    const game = new Game({ seed: 2 });
    game.newGame(0);
    tick(game, idle, seconds(INTRO_TIME) + 1);
    const pod = game.markers.find((m) => m.kind === "pod");
    assert.equal(pod.item, STAGES[0].pods[0]);
    game.camX = pod.x - 150;
    game.player.x = game.camX + 100;
    for (let f = 0; f < 120 && !game.enemies.some((e) => e.kind === "pod"); f += 1) tick(game, idle);
    const flying = game.enemies.find((e) => e.kind === "pod");
    assert.ok(flying, "pod spawned");
    assert.ok(flying.x < game.camX + 10);
  });

  it("the shield item makes the player safe for a while", () => {
    const game = playing();
    game.collect({ kind: "shield" });
    assert.ok(game.player.safe);
    assert.equal(game.weapon, "rifle");
  });
});

describe("boss", () => {
  it("defeating the boss scores big and clears the stage", () => {
    const game = playing({ invincible: true });
    game.boss = { x: 0, y: 0, w: 10, h: 10 };
    const before = game.score;
    game.defeatBoss();
    assert.equal(game.score - before, BOSS_SCORE);
    tick(game, idle, seconds(3));
    assert.equal(game.state, "clear");
    assert.ok(game.takeEvents().some((e) => e.type === "clear"));
  });
});

describe("robustness", () => {
  it("identical seeds and inputs replay identically", () => {
    const script = (f) => press({ right: f % 90 < 70, jump: f % 45 === 0, shoot: true, up: f % 200 > 150 });
    const run = () => {
      const game = new Game({ seed: 77 });
      game.newGame();
      tick(game, script, 60 * 30);
      return [game.score, game.player.x.toFixed(3), game.camX.toFixed(3), game.lives, game.state];
    };
    assert.deepEqual(run(), run());
  });

  for (const [index, stage] of STAGES.entries()) {
    it(`survives 2 minutes of random input in ${stage.name}`, () => {
      const rng = mulberry32(index + 1);
      const game = new Game({ seed: 5 + index });
      game.newGame(index);
      let held = idle;
      for (let f = 0; f < 60 * 120; f += 1) {
        if (f % 10 === 0) {
          held = { left: rng() < 0.25, right: rng() < 0.6, up: rng() < 0.2, down: rng() < 0.15, jump: rng() < 0.3, shoot: rng() < 0.8 };
        }
        game.update(held, 1 / 60);
        if (game.state === "game-over") game.continueGame() || game.newGame(index);
        if (game.state === "clear") game.nextStage();
        const p = game.player;
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
        if (p.alive && game.state === "playing") {
          assert.ok(p.x >= game.camX - 0.01 && p.x <= game.camX + 320, "on screen");
        }
      }
    });
  }
});
