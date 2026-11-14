# Biệt Kích Sấm — Thunder Commando

An original browser game in the classic **run-and-gun** genre. One commando against a robot army:
run, jump, go prone and shoot in **8 directions** through three stages, grab supply weapons, and
take down a mechanical boss at the end of each stage. One hit is fatal.

- 3 stages with forward-only scrolling: misty jungle, hydro dam, volcano fortress
- 8-way aim, spin jump (smaller hurtbox), prone (low shots pass overhead), drop through ledges
- Rifle plus 4 supply weapons (spread, rapid fire, piercing laser, homing) and a 12 s energy shield,
  from crates you shoot open and supply pods that fly across the screen. Dying drops your weapon
- 7 enemy types: runners and runner squads, gunners, bush snipers, wall turrets, mortars, drones
- 3 bosses with telegraphed attacks: spider tank, gunship, and a two-phase mech general
- 3 lives, an extra life every 20 000 points, 2 continues from the last checkpoint
- Keyboard, 8-way touch d-pad, gamepad · best score saved · synthesised sfx and chiptune music
- All art and sound are generated in code: zero dependencies, no build step, no asset files

## Play

```bash
npm start      # http://127.0.0.1:5173
```

| Key                     | Action                                             |
|-------------------------|----------------------------------------------------|
| `←` `→`                 | Run                                                |
| `↑` / `↓`               | Aim up / down (`↓` standing still = prone)         |
| `Z` / `Space`           | Jump · `↓` + `Z` on a ledge = drop through         |
| `X`                     | Shoot (hold for automatic fire)                    |
| `P` / `Esc`             | Pause                                              |
| `M` / `N`               | Sound / music on/off                               |

Gamepad: stick/D-pad to move and aim, A to jump, B/X/Y/RT to shoot, Start to pause.

## Test

```bash
npm test       # 86 tests, < 1 s
```

The suite includes two proofs. A **route search over the real player physics** shows every stage's
boss arena can be reached from the start and from every checkpoint, and a **scripted soldier bot**
beats every boss with the starting rifle.

## Project layout

```text
index.html, styles.css        UI shell
src/main.js                   loop, HUD, menus, events → sound/particles, storage
src/ui/                       render.js (canvas, procedural art) · audio.js · input.js · themes.js · storage.js
src/core/                     pure game rules (no DOM), fully unit-tested
  constants.js, rng.js        screen size, fixed step, seeded RNG
  level.js, stages.js         ASCII tile maps, chunk joiner, boss arena, the 3 stages
  physics.js                  AABB vs tiles, ledges, hazards
  player.js                   movement, 8-way aim, pose-dependent hurtbox
  weapons.js                  rifle, supply weapons, shield
  enemies.js, bosses.js       enemy and boss AI
  game.js                     state machine: intro, play, death/respawn, boss, clear, continue, victory
tests/                        node:test suites + support/ (route search, boss bot)
scripts/serve.mjs             zero-dependency static dev server
```

## Engineering process

1. [Spec](docs/01-SPEC.md): rules and requirements
2. [Design](docs/02-DESIGN.md): architecture, movement tuning, hurtboxes, weapons, bosses, levels
3. [Tasks](docs/03-TASKS.md): traceable task list and backlog
4. Implementation: `src/`
5. [Testing](docs/04-TESTING.md): unit suites, route search, boss bot, browser e2e, bugs found
6. [Deploy](docs/05-DEPLOY.md): GitHub Pages, CI

## Credits & license

Game design, characters, enemies, levels, art and music are original. It's a tribute to the
run-and-gun genre, not a copy of any specific game, film or character. Licensed under GPL-3.0.

## Analytics

Optional, anonymous play counts via [GoatCounter](https://www.goatcounter.com): no cookies and no
personal data. It is off until you set `GOATCOUNTER_CODE` in `src/ui/analytics.js`. Events are
sent when a game starts, continues and ends; see the `track(...)` calls in `src/main.js`.
