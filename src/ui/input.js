/**
 * Keyboard, touch and gamepad merged into one held-button snapshot per frame:
 * { left, right, up, down, jump, shoot }. One-shot commands (pause, mute, music) go through
 * the `onCommand` callback. The touch d-pad reads the finger's angle, so diagonals work.
 */

const KEYS = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  KeyZ: "jump",
  Space: "jump",
  KeyK: "jump",
  KeyX: "shoot",
  KeyJ: "shoot",
};

const COMMAND_KEYS = {
  KeyP: "pause",
  Escape: "pause",
  KeyM: "mute",
  KeyN: "music",
};

const BUTTONS = ["left", "right", "up", "down", "jump", "shoot"];

/** Directions for a vector from the d-pad centre (8 sectors, with a small dead zone). */
export function dpadDirections(dx, dy, deadZone = 10) {
  if (Math.hypot(dx, dy) < deadZone) return [];
  const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  const map = {
    0: ["right"], 1: ["right", "down"], 2: ["down"], 3: ["left", "down"],
    4: ["left"], "-4": ["left"], "-3": ["left", "up"], "-2": ["up"], "-1": ["right", "up"],
  };
  return map[sector] ?? [];
}

export function createInput({ onCommand, isPlaying }) {
  const keys = new Set();
  const touches = new Map(); // pointerId → [buttons]
  let padPrev = [];

  window.addEventListener("keydown", (event) => {
    const button = KEYS[event.code];
    if (button) {
      keys.add(button);
      if (isPlaying()) event.preventDefault();
    }
    const command = COMMAND_KEYS[event.code];
    if (command && !event.repeat) {
      onCommand(command);
      event.preventDefault();
    }
  });
  window.addEventListener("keyup", (event) => {
    const button = KEYS[event.code];
    if (button) keys.delete(button);
  });
  window.addEventListener("blur", () => {
    keys.clear();
    touches.clear();
  });

  /** Wire the on-screen controls: a d-pad ([data-dpad]) and buttons ([data-button] / [data-command]). */
  function bindTouch(root) {
    const dpad = root.querySelector("[data-dpad]");
    const fromDpad = (event) => {
      const box = dpad.getBoundingClientRect();
      return dpadDirections(event.clientX - (box.left + box.width / 2), event.clientY - (box.top + box.height / 2), box.width * 0.12);
    };
    const release = (event) => {
      touches.delete(event.pointerId);
      refresh(root);
    };
    root.addEventListener("pointerdown", (event) => {
      const target = event.target.closest("[data-dpad],[data-button],[data-command]");
      if (!target) return;
      event.preventDefault();
      if (target.dataset.command) {
        onCommand(target.dataset.command);
        return;
      }
      root.setPointerCapture?.(event.pointerId);
      touches.set(event.pointerId, target === dpad ? { dpad: true, held: fromDpad(event) } : { held: [target.dataset.button] });
      refresh(root);
    });
    root.addEventListener("pointermove", (event) => {
      const touch = touches.get(event.pointerId);
      if (!touch?.dpad) return;
      touch.held = fromDpad(event);
      refresh(root);
    });
    root.addEventListener("pointerup", release);
    root.addEventListener("pointercancel", release);
    root.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  function refresh(root) {
    const held = new Set([...touches.values()].flatMap((t) => t.held));
    root.querySelectorAll("[data-button]").forEach((el) => el.classList.toggle("pressed", held.has(el.dataset.button)));
    root.querySelectorAll("[data-dir]").forEach((el) => el.classList.toggle("pressed", held.has(el.dataset.dir)));
  }

  function readGamepad(state) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = [...pads].find(Boolean);
    if (!pad) return;
    const b = (i) => Boolean(pad.buttons[i]?.pressed);
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    state.left ||= b(14) || ax < -0.4;
    state.right ||= b(15) || ax > 0.4;
    state.up ||= b(12) || ay < -0.5;
    state.down ||= b(13) || ay > 0.5;
    state.jump ||= b(0);
    state.shoot ||= b(1) || b(2) || b(3) || b(7);
    const now = pad.buttons.map((x) => x.pressed);
    if (now[9] && !padPrev[9]) onCommand("pause");
    padPrev = now;
  }

  return {
    bindTouch,
    snapshot() {
      const state = Object.fromEntries(BUTTONS.map((name) => [name, keys.has(name)]));
      for (const touch of touches.values()) for (const button of touch.held) state[button] = true;
      readGamepad(state);
      return state;
    },
    clear() {
      keys.clear();
    },
  };
}
