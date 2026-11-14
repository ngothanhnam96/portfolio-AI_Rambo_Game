import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ARENA_COLS, FLOOR_ROW, ROWS, TILE } from "../src/core/constants.js";
import { arenaChunk, joinChunks, T_HAZARD, T_LEDGE, T_SOLID } from "../src/core/level.js";
import { buildLevel, STAGES, stageRows } from "../src/core/stages.js";
import { levelFrom } from "./support/helpers.js";
import { findRoute } from "./support/reach.js";

describe("level parsing", () => {
  it("joins chunks side by side and rejects ragged chunks", () => {
    const a = Array.from({ length: ROWS }, () => "ab");
    const b = Array.from({ length: ROWS }, () => "c");
    assert.equal(joinChunks([a, b])[0], "abc");
    assert.throws(() => joinChunks([a.slice(1)]), /rows/);
    assert.throws(() => joinChunks([[...a.slice(1), "abc"]]), /wide/);
  });

  it("reads tiles, enemies, crates, markers", () => {
    const level = levelFrom(["@.g.3.C.X|p", "##^=#######"]);
    assert.deepEqual([level.start.col, level.start.row], [0, 10]);
    assert.equal(level.start.y, 11 * TILE, "entities stand on the tile below");
    assert.deepEqual(level.spawns.map((s) => s.kind), ["gunner", "crate", "pod"]);
    assert.equal(level.spawns[1].item, "laser");
    assert.equal(level.checkpoints.length, 1);
    assert.equal(level.boss.col, 8);
    assert.equal(level.gateCol, 9);
    assert.equal(level.tile(2, 11), T_HAZARD);
    assert.equal(level.tile(3, 11), T_LEDGE);
    assert.equal(level.tile(-1, 5), T_SOLID, "map edges are walls");
  });

  it("rejects unknown characters", () => {
    assert.throws(() => levelFrom(["..?.", "####"]), /unknown tile/);
  });

  it("finds the first safe floor of a column", () => {
    const level = levelFrom(["....", "..=.", "#.^.", "#..."]);
    assert.equal(level.floorRow(0), 10);
    assert.equal(level.floorRow(1), -1, "a pit");
    assert.equal(level.floorRow(2), 9, "a ledge counts");
    assert.equal(level.floorRow(3), -1);
  });

  it("the arena is one flat open screen with the gate first", () => {
    const rows = arenaChunk();
    assert.equal(rows.length, ROWS);
    assert.ok(rows.every((r) => r.length === ARENA_COLS));
    assert.equal(rows[0][0], "|");
    assert.equal(rows[FLOOR_ROW], "#".repeat(ARENA_COLS));
  });
});

describe("stage data", () => {
  it("has three stages, the last one final", () => {
    assert.equal(STAGES.length, 3);
    assert.deepEqual(STAGES.map((s) => Boolean(s.final)), [false, false, true]);
  });

  for (const stage of STAGES) {
    describe(stage.name, () => {
      const level = buildLevel(stage);

      it("is well formed: one start, a gate, a boss, every row the same width", () => {
        const rows = stageRows(stage);
        assert.ok(rows.every((r) => r.length === rows[0].length));
        assert.ok(level.start);
        assert.ok(level.gateCol > 0);
        assert.equal(level.cols - level.gateCol, ARENA_COLS, "the arena is the last screen");
        assert.ok(level.checkpoints.length >= 1);
      });

      it("enemies, crates and pods are placed before the arena; there are several supply items", () => {
        assert.ok(level.spawns.every((s) => s.x < level.arenaX));
        const supplies = level.spawns.filter((s) => s.kind === "crate" || s.kind === "pod");
        assert.ok(supplies.length >= 3, `${supplies.length} supplies`);
        assert.ok(stage.pods.length > 0);
      });

      it("ground markers stand on something", () => {
        for (const s of level.spawns.filter((x) => !["drone", "pod", "squad"].includes(x.kind))) {
          const below = level.tile(s.col, s.row + 1);
          assert.ok(below === T_SOLID || below === T_LEDGE, `${s.kind} at ${s.col},${s.row}`);
        }
      });

      it("the arena is reachable from the start (real physics search)", () => {
        const result = findRoute(level, level.start);
        assert.ok(result.reached, `stuck around x=${result.furthest} after ${result.nodes} nodes`);
      });

      it("the arena is reachable from every checkpoint", () => {
        for (const cp of level.checkpoints) {
          const result = findRoute(level, cp);
          assert.ok(result.reached, `checkpoint at col ${cp.col}: stuck around x=${result.furthest}`);
        }
      });
    });
  }
});

describe("route search sanity", () => {
  it("finds a plain walk", () => {
    const level = levelFrom(["@.........|.........", "####################"]);
    assert.ok(findRoute(level, level.start).reached);
  });

  it("rejects a gap no jump can cross", () => {
    const level = levelFrom(["@...........|.......", "###.....############"]);
    assert.equal(findRoute(level, level.start).reached, false);
  });

  it("rejects a wall four tiles high", () => {
    const level = levelFrom(["......#....|........", "......#.............", "......#.............", "@.....#.............", "####################"]);
    assert.equal(findRoute(level, level.start).reached, false);
  });

  it("climbs a three-tile step and crosses a three-tile gap", () => {
    const level = levelFrom(["......####...|######", "......####...#######", "@.....####...#######", "##########...#######"]);
    assert.ok(findRoute(level, level.start).reached);
  });
});
