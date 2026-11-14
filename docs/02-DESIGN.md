# 02 · Design

## Architecture

```text
              src/main.js  (loop, HUD, menus, events → sfx/particles)
             ┌──────┴───────────────────────────┐
        src/ui/                               src/core/   (pure, no DOM, unit-tested)
  render · audio · input                       game.js  ── state machine
  themes · storage · analytics                    │
                                 player  weapons  enemies  bosses  stages ── level
                                    └──────── physics ────────┘
```

The core never touches the DOM. `main.js` feeds a held-button snapshot into `game.update(input, 1/60)`
at a fixed 60 Hz, then drains `game.takeEvents()` (`shoot`, `explode`, `death`, `boss-intro`, …)
for sounds and particles. Everything random goes through a seeded `mulberry32`, so a test can
replay a whole game.

## States

```text
title → intro (1.6 s card) → playing ⇄ paused
                               │ camX reaches the arena → boss spawns (1.6 s warning, invulnerable)
                               │ boss destroyed → boss-dying (2.6 s) → clear → intro (next stage)
                               └ hit → dying (1.4 s) → playing (respawn) | game-over → continue
last boss → victory
```

## Movement tuning (60 Hz)

| Parameter | Value | Effect |
|-----------|-------|--------|
| Run       | 78 px/s | ~4 s to cross a screen |
| Jump      | 330 px/s up, gravity 900 | ~60 px high (3.8 tiles), 0.73 s in the air, ~57 px of drift |
| Drop      | ledges ignored for 0.2 s after ↓ + jump | |
| Respawn   | falls in from the top, 2.5 s invulnerable | on the first column with safe floor |

Level rule of thumb, checked by the route search: steps of at most 3 tiles, gaps of at most 3 tiles
at the same height, ledges 3 tiles above the ground or above another ledge.

## Hurtboxes

| Pose | Box (relative to the 12 × 22 body) | Dodges |
|------|-----------|--------|
| Standing / running | 10 × 20 | |
| Prone | 18 × 9 at the feet | chest-high shots, the general's high beam |
| Spin jump | 10 × 12 | the low beam, shockwaves, ground blasts |

The collision body stays 12 × 22 in every pose, so posing never pushes you into a wall.

## Camera

`camX = max(camX, min(arenaX, player.cx − 0.42 × 320))`: forward only, with the player kept at 42 %
of the screen. The player is clamped to `[camX, camX + 320 − w]`. When `camX` reaches the arena's
left edge it stays there and the boss appears; the arena is the stage's last screen.

## Spawning

Markers in the map come alive as they scroll into view and never come back (the camera never
returns). Drones enter from the right edge, supply pods from the left once the camera is halfway to
their marker. A runner squad sends a runner from the right edge every 2.4 s (3 alive at most) while
its marker is ahead in the right half of the screen. Restarting at a checkpoint skips markers
behind it. Enemies are removed 40 px off the left edge.

## Weapons and economy

| Weapon | Volley | Damage | Rate (s) | Max on screen |
|--------|--------|--------|----------|---------------|
| Súng Trường (rifle) | 1 bullet, 270 px/s | 1 | 0.17 | 4 |
| Đạn Chùm (spread) | 5 bullets in a ±0.28 rad fan | 1 each | 0.26 | 15 |
| Liên Thanh (rapid) | 1 bullet, 330 px/s | 1 | 0.09 | 8 |
| Tia Laser | 1 piercing beam, 430 px/s | 3 | 0.40 | 2 |
| Đạn Đuổi (homing) | 1 missile, turns 4.5 rad/s | 2 | 0.30 | 4 |
| Khiên (shield) | 12 s of invulnerability | | | |

The on-screen cap is what limits long-range fire; at point blank the rate is the limit. Death drops
the weapon back to the rifle, so supplies are spread through every stage (crates and pods; ≥ 3 per
stage, enforced by a test).

Scores: runner 100, gunner and drone 200, sniper and pod 300, mortar 400, turret 500, crate 100,
boss missile 50, item 200, boss 10 000.

## Bosses

| Boss | HP | Attacks (in turn) | Answer |
|------|----|-------------------|--------|
| Nhện Thép K-9 (spider tank) | 70 | 3 arcing shells aimed around you · 6-shot aimed burst · crawls to mid-arena and back | keep moving · prone / jump · it always leaves 150 px behind you |
| Trực Thăng Ó Đen (gunship) | 90 | bomb run across the arena · 2 slow homing missiles · two 7-bullet fans | run out from under it · shoot the missiles (1 hit) · stand in the gaps |
| Tướng Thép (mech general) | 140 | 3 rockets · beam, low or high (0.8 s warning with a "jump" / "prone" hint) · leap + two shockwaves | move · jump the low beam, go prone under the high one · jump the waves |

Phase 2 (spider and general, below half HP): attacks 30 % faster, one more shell/shot/rocket, and
the general fires a low then a high beam back to back. The gunship gets no phase 2: hitting it at
all means aiming up, which is its difficulty.

## Levels

Stages are 12-row ASCII chunks joined left to right, then a 20-column arena (one screen, flat
floor). Legend in `src/core/level.js`. Stage 1 (jungle) teaches the basics: ledges, a pit, a
bridge over stakes, a plateau. Stage 2 (dam) adds catwalks over live water, turrets and mortars.
Stage 3 (fortress) packs lava pits with stepping stones, snipers on blocks and everything at once.

## Rendering and audio

- Canvas backing store = 320 × 192 × integer scale (DPR-aware), smoothing off. Size comes from the
  layout viewport.
- Every sprite is code-drawn (rectangles, arcs, lines). The rifle is a line from the shoulder to
  the muzzle, so all 8 aim directions come for free. Each theme has a sky gradient, two parallax
  layers and its own tiles.
- WebAudio: synthesised sfx per weapon and 5 original 16-step loops (title, 3 stages, boss) with a
  kick and snare.

## Risks

| Risk | Mitigation |
|------|------------|
| Unfinishable stage after a map edit | Route-search test over the real physics from the start and every checkpoint |
| Unbeatable or broken boss pattern | Bot fight test per boss, a 45 s "stays in the arena and uses ≥ 3 attacks" test, beam/hurtbox geometry tests |
| One-hit deaths feel unfair | Pose-dependent hurtboxes, telegraphs, 2.5 s respawn invulnerability, respawn on safe ground |
| Enemy flood | Squads cap at 3 runners and stop once passed; markers fire once |
| Trademarked classics of the genre | Original name, hero, robot army, bosses, levels, art and music |
