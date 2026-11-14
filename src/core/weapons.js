/**
 * Guns and supply items. Shooting is automatic while the button is held: the weapon's
 * `rate` is the time between volleys and `max` caps its bullets on screen.
 * Dying drops whatever you carry back to the rifle.
 */

export const WEAPONS = Object.freeze({
  rifle: Object.freeze({ id: "rifle", name: "Súng Trường", short: "S", color: "#ffe27a", rate: 0.17, max: 4 }),
  spread: Object.freeze({ id: "spread", name: "Đạn Chùm", short: "C", color: "#ff6b6b", rate: 0.26, max: 15 }),
  rapid: Object.freeze({ id: "rapid", name: "Liên Thanh", short: "L", color: "#7ee787", rate: 0.09, max: 8 }),
  laser: Object.freeze({ id: "laser", name: "Tia Laser", short: "T", color: "#5ff2ff", rate: 0.4, max: 2 }),
  homing: Object.freeze({ id: "homing", name: "Đạn Đuổi", short: "Đ", color: "#ffb02e", rate: 0.3, max: 4 }),
});

export const WEAPON_ORDER = ["rifle", "spread", "rapid", "laser", "homing"];

/** Supply items: every weapon except the rifle, plus a temporary shield. */
export const ITEMS = Object.freeze({
  spread: WEAPONS.spread,
  rapid: WEAPONS.rapid,
  laser: WEAPONS.laser,
  homing: WEAPONS.homing,
  shield: Object.freeze({ id: "shield", name: "Khiên Năng Lượng", short: "K", color: "#c48bff" }),
});

export const SHIELD_TIME = 12;
const SPREAD_ANGLES = [-0.28, -0.14, 0, 0.14, 0.28];

function bullet(props) {
  return { pierce: false, homing: 0, life: 1.6, hits: new Set(), ...props };
}

function aimed(weapon, kind, origin, angle, speed, size, extra = {}) {
  return bullet({
    weapon,
    kind,
    x: origin.x - size / 2,
    y: origin.y - size / 2,
    w: size,
    h: size,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    ...extra,
  });
}

/** The bullets of one volley. `aim` is a unit vector. */
export function fireWeapon(weapon, origin, aim) {
  const angle = Math.atan2(aim.y, aim.x);
  switch (weapon) {
    case "spread":
      return SPREAD_ANGLES.map((da) => aimed(weapon, "spread", origin, angle + da, 240, 5, { damage: 1 }));
    case "rapid":
      return [aimed(weapon, "rapid", origin, angle, 330, 4, { damage: 1 })];
    case "laser":
      return [aimed(weapon, "laser", origin, angle, 430, 8, { damage: 3, pierce: true, life: 1 })];
    case "homing":
      return [aimed(weapon, "homing", origin, angle, 170, 6, { damage: 2, homing: 4.5, life: 2.4 })];
    default:
      return [aimed("rifle", "rifle", origin, angle, 270, 4, { damage: 1 })];
  }
}
