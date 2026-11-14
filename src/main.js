/**
 * UI controller: the fixed-step loop, HUD, menus, and game events → sounds and particles.
 * All rules live in src/core (pure, unit-tested); this file only presents them.
 */

import { DT } from "./core/constants.js";
import { CONTINUES, Game } from "./core/game.js";
import { STAGES } from "./core/stages.js";
import { ITEMS, WEAPON_ORDER, WEAPONS } from "./core/weapons.js";
import { initAnalytics, track } from "./ui/analytics.js";
import { isMusicOn, isMuted, playMusic, setMusic, setMuted, sfx, stopMusic } from "./ui/audio.js";
import { createInput } from "./ui/input.js";
import { createRenderer, Particles } from "./ui/render.js";
import { load, save } from "./ui/storage.js";

initAnalytics();

const $ = (id) => document.getElementById(id);
const els = {
  hud: $("hud"),
  weaponChip: $("weapon-chip"),
  weaponLetter: $("weapon-letter"),
  weaponName: $("weapon-name"),
  stageName: $("stage-name"),
  bossBar: $("boss-bar"),
  bossName: $("boss-name"),
  bossFill: $("boss-fill"),
  lives: $("lives"),
  score: $("score"),
  pauseBtn: $("pause-btn"),
  soundBtn: $("sound-btn"),
  overlay: $("overlay"),
  panel: $("panel"),
  touch: $("touch"),
  canvas: $("screen"),
};

const game = new Game();
if (new URLSearchParams(location.search).has("debug")) window.__game = game; // for browser e2e checks only
const renderer = createRenderer(els.canvas);
const particles = new Particles();
let best = load("best", 0);
let time = 0;
let lastState = null;
const booms = []; // delayed explosions for boss deaths

setMuted(load("muted", false));
setMusic(load("music", true));

const input = createInput({
  isPlaying: () => ["playing", "intro", "dying", "boss-dying"].includes(game.state),
  onCommand(command) {
    sfx.unlock();
    if (command === "pause") togglePause();
    else if (command === "mute") toggleSound();
    else if (command === "music") toggleMusic();
  },
});
input.bindTouch(els.touch);

// ------------------------------------------------------------------ events → sound & particles

let lastEnemySfx = 0;
let lastBossHitSfx = 0;

function handleEvents(events) {
  for (const e of events) {
    switch (e.type) {
      case "shoot":
        sfx.shoot(e.weapon);
        particles.add({ x: e.x, y: e.y, color: "#fff3b0", size: 3, life: 0.05 });
        break;
      case "enemy-shot":
      case "boss-fire":
      case "mortar":
        if (time - lastEnemySfx > 0.08) {
          sfx.enemyShot();
          lastEnemySfx = time;
        }
        particles.add({ x: e.x, y: e.y, color: "#ffb02e", size: 3, life: 0.06 });
        break;
      case "jump":
        sfx.jump();
        break;
      case "land":
        sfx.land();
        particles.burst(e.x, e.y - 1, "#cfcfbf", 3, 25, { life: 0.2 });
        break;
      case "hit":
        sfx.hit();
        particles.burst(e.x, e.y, "#ffffff", 3, 50, { life: 0.15 });
        break;
      case "deflect":
        sfx.deflect();
        particles.burst(e.x, e.y, "#ffffff", 2, 40, { life: 0.12 });
        break;
      case "explode":
        sfx.explode();
        particles.explosion(e.x, e.y, e.kind === "turret" || e.kind === "mortar" ? 1.3 : e.kind === "missile" ? 0.6 : 1);
        if (e.kind === "crate") particles.burst(e.x, e.y, "#a07a44", 8, 90, { gravity: 300, life: 0.6 });
        break;
      case "blast":
        sfx.blast();
        particles.explosion(e.x, e.y - 6, 0.7);
        break;
      case "death":
        sfx.death();
        renderer.shake(0.35);
        particles.burst(e.x, e.y, "#ff8a3d", 14, 110, { life: 0.7 });
        particles.add({ x: e.x, y: e.y, shape: "ring", color: "#ffffff", size: 26, life: 0.4 });
        break;
      case "respawn":
        sfx.respawn();
        break;
      case "pickup": {
        sfx.pickup();
        const item = ITEMS[e.kind];
        particles.add({ shape: "text", text: item.name.toUpperCase(), x: e.x, y: e.y - 6, vy: -18, color: item.color, life: 1.2 });
        particles.burst(e.x, e.y, item.color, 10, 70, { life: 0.4 });
        break;
      }
      case "extra-life":
        sfx.extraLife();
        toast("+1 mạng!");
        break;
      case "checkpoint":
        sfx.checkpoint();
        particles.add({ shape: "text", text: "CHECKPOINT", x: e.x, y: e.y - 34, vy: -12, color: "#7ee787", life: 1.2 });
        break;
      case "stage-start":
        playMusic(e.stage);
        break;
      case "boss-intro":
        sfx.warning();
        playMusic("boss");
        break;
      case "boss-hit":
        if (time - lastBossHitSfx > 0.06) {
          sfx.bossHit();
          lastBossHitSfx = time;
        }
        particles.burst(e.x, e.y, "#ffe27a", 3, 60, { life: 0.15 });
        break;
      case "boss-defeat":
        sfx.bossDefeat();
        stopMusic();
        renderer.shake(1.2);
        for (let i = 0; i < 9; i += 1) {
          booms.push({ at: time + i * 0.22, x: e.x + (Math.random() - 0.5) * 50, y: e.y + (Math.random() - 0.5) * 40 });
        }
        break;
      case "phase":
        renderer.shake(0.5);
        toast(e.boss === "spider" ? "Nhện Thép nổi giận!" : "Tướng Thép kích hoạt toàn lực!");
        break;
      case "quake":
        sfx.quake();
        renderer.shake(0.3);
        break;
      case "warning":
        sfx.warning();
        break;
      default:
        break;
    }
  }
}

function updateBooms() {
  while (booms.length && booms[0].at <= time) {
    const b = booms.shift();
    sfx.explode();
    particles.explosion(b.x, b.y, 1.6);
  }
}

// ------------------------------------------------------------------ HUD

let hudCache = "";

function updateHud() {
  const inStage = Boolean(game.stage) && game.state !== "title";
  els.hud.classList.toggle("hidden", !inStage);
  if (!inStage) return;
  const weapon = WEAPONS[game.weapon];
  const boss = game.boss;
  const shielded = Boolean(game.player?.shieldT > 0);
  const key = [game.weapon, game.lives, game.score, boss?.hp, boss?.introT > 0, shielded, game.stageIndex].join("|");
  if (key === hudCache) return;
  hudCache = key;
  els.weaponChip.style.setProperty("--wc", weapon.color);
  els.weaponChip.classList.toggle("shielded", shielded);
  els.weaponLetter.textContent = weapon.short;
  els.weaponName.textContent = weapon.name;
  els.stageName.textContent = `Màn ${game.stageIndex + 1} · ${game.stage.name}`;
  els.lives.textContent = `×${Math.max(0, game.lives)}`;
  els.score.textContent = game.score.toString().padStart(7, "0");
  els.bossBar.hidden = !boss || boss.introT > 0;
  if (boss) {
    els.bossName.textContent = boss.name;
    els.bossFill.style.width = `${(boss.hp / boss.maxHp) * 100}%`;
  }
}

// ------------------------------------------------------------------ overlays

function showPanel(html) {
  els.panel.innerHTML = html;
  els.overlay.classList.add("open");
  els.panel.querySelector("button:not([disabled])")?.focus();
}

function hidePanel() {
  els.overlay.classList.remove("open");
  els.panel.innerHTML = "";
}

const CONTROLS = `
  <table class="controls">
    <tr><td><kbd>←</kbd><kbd>→</kbd></td><td>Chạy</td></tr>
    <tr><td><kbd>↑</kbd> / <kbd>↓</kbd></td><td>Ngắm lên / xuống · <kbd>↓</kbd> đứng yên = nằm bắn</td></tr>
    <tr><td><kbd>Z</kbd> / <kbd>Space</kbd></td><td>Nhảy · <kbd>↓</kbd>+<kbd>Z</kbd> trên bục = nhảy xuống</td></tr>
    <tr><td><kbd>X</kbd></td><td>Bắn (giữ để bắn liên tục)</td></tr>
    <tr><td><kbd>P</kbd> · <kbd>M</kbd> · <kbd>N</kbd></td><td>Tạm dừng · Âm thanh · Nhạc</td></tr>
  </table>`;

const ARSENAL = `
  <ul class="arsenal">
    ${[...WEAPON_ORDER.slice(1).map((id) => WEAPONS[id]), ITEMS.shield]
      .map((w) => `<li style="--wc:${w.color}"><b>${w.short}</b>${w.name}</li>`).join("")}
  </ul>`;

function titleScreen() {
  showPanel(`
    <p class="eyebrow">Run &amp; gun · 3 màn · 3 trùm cơ khí</p>
    <h1 class="logo">BIỆT KÍCH <span>SẤM</span></h1>
    <p class="lead">Đạo quân robot Thiết Binh chiếm rừng sương, đập thủy điện và pháo đài núi lửa. Một người lính, một khẩu súng, trúng một phát là ngã. Bắn rương tiếp tế để đổi súng mạnh hơn.</p>
    <div class="buttons"><button class="primary" data-action="new">Xuất kích</button></div>
    ${ARSENAL}
    ${CONTROLS}
    <p class="muted">Kỷ lục: ${best.toLocaleString("vi-VN")}</p>
  `);
}

function pauseScreen() {
  showPanel(`
    <h2>Tạm dừng</h2>
    <div class="buttons">
      <button class="primary" data-action="resume">Tiếp tục</button>
      <button data-action="title">Về màn hình chính</button>
    </div>
    ${CONTROLS}
  `);
}

function clearScreen() {
  const info = game.clearInfo;
  const next = STAGES[game.stageIndex + 1];
  showPanel(`
    <p class="eyebrow">Màn ${game.stageIndex + 1} hoàn thành</p>
    <h2>${game.stage.name} đã giải phóng!</h2>
    <p>Thời gian: ${formatTime(info.time)} · Điểm: ${game.score.toLocaleString("vi-VN")} · Mạng: ×${game.lives}</p>
    <p class="muted">Tiếp theo: <strong>${next.name}</strong>. Bạn giữ nguyên vũ khí đang cầm.</p>
    <div class="buttons"><button class="primary" data-action="next">Màn tiếp theo</button></div>
  `);
}

function victoryScreen() {
  showPanel(`
    <p class="eyebrow">Tướng Thép đã gục ngã</p>
    <h1 class="logo">CHIẾN <span>THẮNG</span></h1>
    <p class="lead">Pháo đài núi lửa sụp đổ, đạo quân Thiết Binh tắt lịm. Biệt kích trở về.</p>
    <p>Điểm: <strong>${game.score.toLocaleString("vi-VN")}</strong> · Kỷ lục: ${best.toLocaleString("vi-VN")}</p>
    <div class="buttons"><button class="primary" data-action="new">Chơi lại từ đầu</button></div>
  `);
}

function gameOverScreen() {
  const left = game.continues;
  showPanel(`
    <h2>Hết mạng</h2>
    <p>Điểm: ${game.score.toLocaleString("vi-VN")} · Kỷ lục: ${best.toLocaleString("vi-VN")}</p>
    <p class="muted">${left > 0 ? `Chơi tiếp từ checkpoint gần nhất (điểm về 0). Còn ${left}/${CONTINUES} lượt.` : "Đã dùng hết lượt chơi tiếp."}</p>
    <div class="buttons">
      ${left > 0 ? `<button class="primary" data-action="continue">Chơi tiếp (${left})</button>` : ""}
      <button data-action="new"${left > 0 ? "" : ` class="primary"`}>Chơi lại từ đầu</button>
      <button data-action="title">Màn hình chính</button>
    </div>
  `);
}

els.panel.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  sfx.unlock();
  sfx.menu();
  switch (button.dataset.action) {
    case "new":
      particles.clear();
      game.newGame();
      track("commando/start");
      break;
    case "continue":
      particles.clear();
      game.continueGame();
      track("commando/continue");
      break;
    case "next":
      particles.clear();
      game.nextStage();
      break;
    case "resume":
      togglePause();
      break;
    case "title":
      game.state = "title";
      break;
    default:
      break;
  }
});

function onStateChange(state, previous) {
  if (state === "title") {
    titleScreen();
    playMusic("title");
  } else if (state === "paused") {
    pauseScreen();
  } else if (state === "clear" || state === "victory") {
    sfx.clear();
    stopMusic();
    recordScore();
    track(state === "clear" ? "commando/clear" : "commando/victory");
    if (state === "clear") clearScreen();
    else victoryScreen();
  } else if (state === "game-over") {
    sfx.gameOver();
    stopMusic();
    recordScore();
    track("commando/game-over");
    gameOverScreen();
  } else if (previous === "paused" || previous === "title" || previous === "clear" || previous === "game-over" || previous === "victory") {
    hidePanel();
  }
}

function recordScore() {
  if (game.score > best) {
    best = game.score;
    save("best", best);
  }
}

// ------------------------------------------------------------------ controls

function togglePause() {
  if (game.state === "playing" || game.state === "paused") {
    game.togglePause();
    input.clear();
  }
}

function toggleSound() {
  setMuted(!isMuted());
  save("muted", isMuted());
  els.soundBtn.textContent = isMuted() ? "🔇" : "🔊";
  els.soundBtn.setAttribute("aria-pressed", String(!isMuted()));
}

function toggleMusic() {
  setMusic(!isMusicOn());
  save("music", isMusicOn());
  toast(isMusicOn() ? "🎵 Bật nhạc nền" : "Tắt nhạc nền");
}

els.pauseBtn.addEventListener("click", (event) => {
  togglePause();
  event.currentTarget.blur();
});
els.soundBtn.addEventListener("click", (event) => {
  sfx.unlock();
  toggleSound();
  event.currentTarget.blur();
});
els.soundBtn.textContent = isMuted() ? "🔇" : "🔊";

document.addEventListener("visibilitychange", () => {
  if (document.hidden && game.state === "playing") togglePause();
});
window.addEventListener("pointerdown", () => sfx.unlock(), { once: true });
window.addEventListener("keydown", () => sfx.unlock(), { once: true });

let toastTimer = null;
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 1500);
}

function formatTime(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ------------------------------------------------------------------ loop

const coarse = window.matchMedia("(pointer: coarse)");
const syncTouch = () => document.body.classList.toggle("touch-ui", coarse.matches);
coarse.addEventListener?.("change", syncTouch);
syncTouch();

window.addEventListener("resize", () => renderer.resize());
renderer.resize();

let last = performance.now();
let acc = 0;
function frame(now) {
  const elapsed = Math.min(0.1, (now - last) / 1000);
  acc += elapsed;
  last = now;
  while (acc >= DT) {
    tick(input.snapshot());
    acc -= DT;
  }
  try {
    renderer.draw(game, particles, time, elapsed);
    updateHud();
  } finally {
    requestAnimationFrame(frame); // one bad frame must never freeze the game
  }
}

/** One fixed 60 Hz step of the game and everything that reacts to it. */
function tick(held) {
  game.update(held, DT);
  handleEvents(game.takeEvents());
  particles.update(DT);
  time += DT;
  updateBooms();
  if (game.state !== lastState) {
    const previous = lastState;
    lastState = game.state;
    onStateChange(game.state, previous);
  }
}

lastState = game.state; // show the title menu right away, not on the first animation frame
onStateChange(game.state, null);
requestAnimationFrame(frame);

if (window.__game) {
  // browser e2e checks: headless browsers throttle animation frames, so advance time by hand
  window.__advance = (seconds, held = {}) => {
    const state = { left: false, right: false, up: false, down: false, jump: false, shoot: false, ...held };
    for (let f = 0; f < Math.round(seconds * 60); f += 1) tick(state);
    renderer.draw(game, particles, time, DT);
    updateHud();
  };
}
