/** Colour palettes. All art is drawn in code from these. */

export const THEMES = Object.freeze({
  jungle: {
    sky: ["#0d2a2c", "#2f5a4a", "#9fbf8a"],
    far: "#1d4038",
    mid: "#173326",
    near: "#0f2419",
    mist: "rgba(220, 240, 225, 0.16)",
    ground: "#6b4a2b",
    groundDark: "#3f2a17",
    top: "#4f9a3a",
    topLight: "#86c95a",
    ledge: "#8a5a32",
    ledgeLight: "#c08a52",
    hazard: ["#1c1410", "#c9b27a", "#8a7444"],
    accent: "#86c95a",
  },
  dam: {
    sky: ["#070b18", "#152446", "#2d4a6e"],
    far: "#26364f",
    mid: "#1a2638",
    near: "#121a27",
    mist: "rgba(160, 200, 255, 0.10)",
    ground: "#6e7480",
    groundDark: "#3d424c",
    top: "#f4c430",
    topLight: "#2b2b2b",
    ledge: "#8e98a8",
    ledgeLight: "#c9d2e0",
    hazard: ["#0d2f5a", "#3fa3ff", "#bfe6ff"],
    accent: "#3fa3ff",
  },
  fortress: {
    sky: ["#14060a", "#3d0d12", "#7a2414"],
    far: "#5a1f1a",
    mid: "#1d0a0c",
    near: "#120608",
    mist: "rgba(255, 120, 60, 0.10)",
    ground: "#4a4650",
    groundDark: "#26232b",
    top: "#7b7585",
    topLight: "#a9a2b5",
    ledge: "#8c3a2a",
    ledgeLight: "#d0623e",
    hazard: ["#ff5a14", "#ffb02e", "#ffe27a"],
    accent: "#ff7a2f",
  },
});

/** The commando: olive helmet, orange scarf, green vest. */
export const HERO = Object.freeze({
  helmet: "#5b6b2f",
  helmetLight: "#8a9c4a",
  skin: "#e0a878",
  scarf: "#ff8a3d",
  vest: "#3f5a2a",
  vestLight: "#5f7f3c",
  pants: "#7d6e4a",
  boots: "#2b2118",
  gun: "#2e333d",
  gunLight: "#9aa3b5",
});

/** The robot army: steel blue with red visors. */
export const ROBOT = Object.freeze({
  body: "#5d6b7d",
  light: "#8a99ad",
  dark: "#323a46",
  visor: "#ff4d4d",
  gun: "#222831",
});
