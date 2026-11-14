import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dpadDirections } from "../src/ui/input.js";

describe("touch d-pad", () => {
  it("maps the finger's angle to 8 directions", () => {
    assert.deepEqual(dpadDirections(30, 0), ["right"]);
    assert.deepEqual(dpadDirections(-30, 0), ["left"]);
    assert.deepEqual(dpadDirections(0, -30), ["up"]);
    assert.deepEqual(dpadDirections(0, 30), ["down"]);
    assert.deepEqual(dpadDirections(25, -25).sort(), ["right", "up"]);
    assert.deepEqual(dpadDirections(-25, 25).sort(), ["down", "left"]);
    assert.deepEqual(dpadDirections(-30, -1), ["left"], "left edge, just above the axis");
  });

  it("ignores touches in the dead zone", () => {
    assert.deepEqual(dpadDirections(3, 4), []);
  });
});
