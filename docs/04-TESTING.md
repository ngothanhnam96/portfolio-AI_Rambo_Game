# 04 · Testing

`npm test` runs `node --test`: 86 tests, under a second, no dependencies.

## Unit and integration suites

| Suite | What it proves | Covers |
|-------|----------------|--------|
| `player.test.js`  | Run speed, fixed ~60 px spin jump that lands where it started, no double jump, prone stops, ↓ + direction keeps running, drop through a ledge but not solid ground, jump up through a ledge; all 8 aim directions incl. straight down in the air; muzzle position; prone hurtbox under chest-high shots, curled spin hurtbox, shield/invulnerability | FR-1–FR-3 |
| `enemies.test.js` | 8-way snapping, gunner timing and aim, a gunner's shot passes over a prone player, sniper hidden/up cycle, turret turns in steps then fires, a mortar shell lands on the player's position, runner hops a step and runs into a pit, squads cap at 3 and stop once passed, drones drift, crates/pods are harmless | FR-8 |
| `bosses.test.js`  | Intro invulnerability, damage cap, phase 2 at half health (not the gunship); each boss spawns when the camera reaches the arena, stays inside it for 45 s and uses ≥ 3 attack kinds; **a scripted bot beats every boss with the rifle**, then clear/victory follows; high beam passes over prone, a jump clears the low beam for its whole lifetime, shockwaves are low, missiles are shootable | FR-9, NFR-5 |
| `stages.test.js`  | Chunk joiner and errors, parser (tiles, enemies, crates, markers, gate), safe-floor lookup, arena shape; per stage: well formed, everything before the arena, ≥ 3 supplies, ground enemies stand on something, **arena reachable from the start and every checkpoint (route search over the real physics)**; search sanity (walks, rejects an impossible gap and a 4-tile wall, climbs 3 tiles and crosses 3) | FR-6, FR-10, NFR-4 |
| `game.test.js`    | Title → intro (input ignored) → playing, pause, forward-only camera and screen clamp, stage chain to victory; autofire rate vs on-screen cap, spread volley of 5, aim direction, kills/score, laser pierces, homing curves; one-hit death → life and weapon lost → fall-in respawn with invulnerability → lands; prone dodge, shield, pits; game over → continue (score 0, checkpoint) → no continues left; extra lives; crate → item → pickup, pods enter from the left, shield item; boss score; identical replays; **2 minutes of random input per stage** | FR-1–FR-11, NFR-3 |
| `input.test.js`   | Touch d-pad angle → 8 directions, dead zone | FR-12 |

## The two proofs

- **Route search** (`tests/support/reach.js`): breadth-first search over standing positions
  (quantised to 4 px). Edges are input macros (step, walk, jumps with early/late/short drift,
  straight up, drop through) simulated frame by frame with the real `Player.update`. Pits and
  hazards prune. It must enter the arena from the start and from every checkpoint.
- **Boss bot** (`tests/support/bot.js`): an invincible soldier with the rifle keeps a medium
  distance, aims at the boss with the 8-way aim (straight or diagonally up under the gunship) and
  holds the trigger. Every boss must fall within 150 s of game time (they take about 18–27 s).

## Browser end-to-end check (v0.1.0)

Headless Edge driven over the DevTools protocol, with the `?debug` hook (`window.__game`,
`window.__advance(seconds, held)`) because headless browsers throttle animation frames:

| Check | Result |
|-------|--------|
| Title menu renders; "Xuất kích" starts stage 1 with the intro card | ✅ |
| Running, shooting and hopping through the first screens; enemies shoot back, a death and the fall-in respawn | ✅ |
| Diagonal aim and prone poses render | ✅ |
| Each stage's scenery mid-stage (jungle, dam with turret/catwalks/drone, fortress with crate/turret) | ✅ |
| Each boss: warning card, health bar, fight with the rifle to the end → clear, clear, victory panels | ✅ |
| Game over panel → continue → stage restarts at intro with 3 lives and score 0 | ✅ |
| Phone viewport (740 × 360, touch): HUD, d-pad, shoot and jump buttons | ✅ |
| Console errors during the whole run | none |

## Bugs found while building

| Bug | Fix |
|-----|-----|
| The title menu was created on the first animation frame, so a throttled (background/headless) tab showed nothing clickable | Show the title synchronously at startup |
| The touch pause button overlapped the bottom of the play area on phones | Removed; the HUD has a pause button |
| The volcano blended into the sky, leaving its crater glow floating | Lighter volcano colour |
| Palm trunks ended in square blocks | Replaced with an undergrowth band |
