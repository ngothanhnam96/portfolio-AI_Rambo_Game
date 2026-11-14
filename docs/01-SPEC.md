# 01 · Specification

## Goal

An original side-scrolling **run-and-gun** shooter for the browser, in the spirit of the 8/16-bit
era: one soldier, 8-way aim, one-hit deaths, supply weapons, and a mechanical boss at the end of
every stage. Desktop and mobile, no install, no dependencies.

## Game loop

Title → stage intro card → play (the camera only scrolls forward) → the camera reaches the boss
arena and locks → boss fight → stage clear → next stage … → victory after the third boss.
Losing every life is game over: continue from the last checkpoint (score back to 0) or start over.

## Functional requirements

| ID    | Requirement |
|-------|-------------|
| FR-1  | Movement: run, a fixed-height **spin jump** with air control, **prone** (↓ standing still), **drop through ledges** (↓ + jump). |
| FR-2  | **8-way aim**: forward, up, diagonal up/down while running, straight down in the air; prone fires low and forward. Holding fire shoots automatically. |
| FR-3  | **One hit kills.** The hurtbox follows the pose: prone is low enough for chest-high shots to pass over, the spin jump curls up. |
| FR-4  | Dying costs a life and the weapon carried; the soldier falls back in from the top of the screen on safe ground with 2.5 s of invulnerability. |
| FR-5  | 3 lives, an extra life every 20 000 points (max 9), 2 continues. A continue restarts the stage at the last checkpoint with 3 lives and a score of 0. |
| FR-6  | The camera only scrolls forward; the player cannot leave the screen. Pits and hazards (stakes, live water, lava) kill. |
| FR-7  | Supply weapons: **Đạn Chùm** (5-way spread), **Liên Thanh** (rapid fire), **Tia Laser** (piercing), **Đạn Đuổi** (homing); plus a 12 s **energy shield**. They come from crates (shoot them open) and supply pods (fly across the screen). Each weapon caps its bullets on screen. |
| FR-8  | Enemies: runner, runner squad (keeps coming from the right edge while ahead), gunner (aimed shots, 8 directions), bush sniper (untouchable while hidden), wall turret (turns in 30° steps), mortar (lobs shells at the player's position), drone. |
| FR-9  | 3 bosses, each with ≥ 3 telegraphed attacks and a counter for each: spider tank, gunship (must be shot from below), mech general with low/high beams and shockwaves. Spider and general get faster in phase 2 below half health. |
| FR-10 | 3 stages with checkpoints, a stage intro card, a boss warning card, a boss health bar, and stage clear / game over / victory screens. |
| FR-11 | Pause (auto-pause when the tab is hidden), sound on/off, music on/off, best score saved on the device. |
| FR-12 | Controls: keyboard, an on-screen 8-way d-pad with jump and shoot buttons on touch devices, gamepad. |

## Non-functional requirements

| ID    | Requirement |
|-------|-------------|
| NFR-1 | Zero runtime dependencies, no build step, static hosting (GitHub Pages). |
| NFR-2 | Original name, hero, enemies, bosses, levels, art and music. No franchise names, characters or assets. |
| NFR-3 | Deterministic core: seeded RNG and fixed 60 Hz steps, so identical inputs replay identically. |
| NFR-4 | **Every stage is provably finishable**: the arena is reachable from the start and every checkpoint (route search over the real physics). |
| NFR-5 | **Every boss is provably beatable** with the starting rifle (scripted bot test). |
| NFR-6 | Crisp pixel rendering at any screen size; playable on a phone in landscape. |
| NFR-7 | CI runs syntax checks and the whole suite on Node 20, 22 and 24 before deploying. |

## Out of scope (v0.1)

Two-player co-op, vertical / top-down stages, remappable controls, difficulty settings. See the
backlog in [03-TASKS](03-TASKS.md).
