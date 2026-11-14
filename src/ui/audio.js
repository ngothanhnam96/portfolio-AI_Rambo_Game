/**
 * Sound effects and chiptune music synthesised with WebAudio: no audio files.
 * Melodies are original, written as semitone steps over a per-song root note.
 */

let context = null;
let master = null;
let musicBus = null;
let muted = false;
let musicOn = true;

function audio() {
  if (muted) return null;
  if (!context) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = 0.5;
    master.connect(context.destination);
    musicBus = context.createGain();
    musicBus.gain.value = musicOn ? 0.32 : 0;
    musicBus.connect(master);
  }
  if (context.state === "suspended") context.resume();
  return context;
}

export function setMuted(value) {
  muted = value;
  if (context) master.gain.value = muted ? 0 : 0.5;
}

export const isMuted = () => muted;

export function setMusic(value) {
  musicOn = value;
  if (musicBus) musicBus.gain.value = musicOn ? 0.32 : 0;
}

export const isMusicOn = () => musicOn;

const hz = (semitones) => 440 * 2 ** (semitones / 12);

function tone(freq, duration, { type = "square", gain = 0.08, delay = 0, slide = 0, bus = null } = {}) {
  const ctx = audio();
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), start + duration);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(env).connect(bus ?? master);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noise(duration, { gain = 0.12, delay = 0, freq = 1200, bus = null } = {}) {
  const ctx = audio();
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = freq;
  const env = ctx.createGain();
  env.gain.value = gain;
  src.connect(filter).connect(env).connect(bus ?? master);
  src.start(start);
}

const SHOTS = {
  rifle: () => tone(hz(5), 0.05, { gain: 0.035, slide: 0.5 }),
  spread: () => { tone(hz(0), 0.08, { gain: 0.04, slide: 0.4 }); noise(0.05, { gain: 0.03, freq: 2500 }); },
  rapid: () => tone(hz(10), 0.035, { gain: 0.03, slide: 0.6 }),
  laser: () => tone(hz(24), 0.18, { type: "sawtooth", gain: 0.04, slide: 0.25 }),
  homing: () => tone(hz(-2), 0.12, { type: "triangle", gain: 0.06, slide: 1.8 }),
};

export const sfx = {
  unlock: () => audio(),
  shoot: (weapon) => (SHOTS[weapon] ?? SHOTS.rifle)(),
  enemyShot: () => tone(hz(-6), 0.05, { type: "triangle", gain: 0.03, slide: 0.7 }),
  jump: () => tone(hz(-5), 0.09, { type: "triangle", gain: 0.04, slide: 1.7 }),
  land: () => noise(0.04, { gain: 0.025, freq: 500 }),
  hit: () => tone(hz(-3), 0.04, { gain: 0.04 }),
  deflect: () => tone(hz(26), 0.04, { type: "triangle", gain: 0.04 }),
  explode() {
    noise(0.28, { gain: 0.13, freq: 900 });
    tone(hz(-19), 0.18, { gain: 0.05, slide: 0.5 });
  },
  blast: () => noise(0.18, { gain: 0.09, freq: 700 }),
  death() {
    noise(0.5, { gain: 0.14, freq: 800 });
    [0, -4, -8, -13].forEach((s, i) => tone(hz(s), 0.14, { gain: 0.06, delay: i * 0.09 }));
  },
  respawn: () => [0, 7, 12].forEach((s, i) => tone(hz(s), 0.08, { type: "triangle", gain: 0.05, delay: i * 0.05 })),
  pickup: () => [12, 16, 19, 24].forEach((s, i) => tone(hz(s), 0.07, { type: "square", gain: 0.05, delay: i * 0.05 })),
  extraLife: () => [12, 19, 24, 28, 31].forEach((s, i) => tone(hz(s), 0.08, { type: "triangle", gain: 0.06, delay: i * 0.06 })),
  checkpoint: () => [7, 14].forEach((s, i) => tone(hz(s), 0.12, { type: "triangle", gain: 0.06, delay: i * 0.08 })),
  warning: () => [14, 14, 14].forEach((s, i) => tone(hz(s), 0.1, { type: "square", gain: 0.05, delay: i * 0.18 })),
  quake: () => noise(0.25, { gain: 0.12, freq: 250 }),
  bossHit: () => tone(hz(-8), 0.04, { gain: 0.04, slide: 0.6 }),
  bossDefeat() {
    for (let i = 0; i < 7; i += 1) noise(0.3, { gain: 0.12, freq: 900, delay: i * 0.25 });
  },
  menu: () => tone(hz(12), 0.05, { type: "triangle", gain: 0.05 }),
  clear: () => [0, 4, 7, 12, 7, 12, 16, 19].forEach((s, i) => tone(hz(s), 0.16, { type: "square", gain: 0.06, delay: i * 0.11 })),
  gameOver: () => [0, -2, -5, -9].forEach((s, i) => tone(hz(s - 5), 0.3, { type: "triangle", gain: 0.08, delay: i * 0.22 })),
};

// ------------------------------------------------------------------ music

// Each song: root (semitones from A4), tempo (steps per second), lead and bass as
// 16-step loops of semitone offsets (null = rest), plus a drum pattern. All original.
const SONGS = {
  title: { root: -7, tempo: 7, lead: [0, null, 3, 5, 7, null, 10, 7, 12, null, 10, 7, 5, null, 3, null], bass: [-12, -12, -9, -9, -7, -7, -5, -5] },
  jungle: { root: -9, tempo: 8, lead: [0, 3, 7, null, 5, 3, 0, null, 3, 5, 7, 10, 7, null, 5, null], bass: [-12, -12, -12, -5, -9, -9, -7, -7] },
  dam: { root: -5, tempo: 8, lead: [7, null, 7, 5, 3, null, 5, 7, 10, null, 8, 7, 5, null, 3, 2], bass: [-12, -12, -10, -10, -8, -8, -7, -5] },
  fortress: { root: -8, tempo: 9, lead: [0, 1, 0, null, 6, 7, 6, null, 0, 1, 3, 1, 0, null, -2, -1], bass: [-12, -12, -11, -11, -12, -12, -14, -13] },
  boss: { root: -6, tempo: 10, lead: [0, 3, 6, 3, 0, 3, 7, 6, 0, 3, 6, 9, 8, 6, 3, null], bass: [-12, -12, -12, -12, -11, -11, -9, -9] },
};

let current = null;
let timer = null;
let step = 0;
let nextTime = 0;

export function playMusic(name) {
  if (current === name) return;
  stopMusic();
  current = name;
  const song = SONGS[name];
  if (!song) return;
  step = 0;
  nextTime = 0;
  timer = setInterval(() => schedule(song), 50);
}

export function stopMusic() {
  current = null;
  if (timer) clearInterval(timer);
  timer = null;
}

function schedule(song) {
  const ctx = context;
  if (!ctx || muted || !musicOn) return;
  const len = 1 / song.tempo;
  if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
  while (nextTime < ctx.currentTime + 0.2) {
    const delay = nextTime - ctx.currentTime;
    const lead = song.lead[step % song.lead.length];
    if (lead !== null) tone(hz(song.root + lead + 12), len * 0.85, { type: "square", gain: 0.045, delay, bus: musicBus });
    if (step % 2 === 0) {
      const bass = song.bass[(step / 2) % song.bass.length];
      tone(hz(song.root + bass), len * 1.8, { type: "triangle", gain: 0.12, delay, bus: musicBus });
    }
    if (step % 4 === 0) noise(0.06, { gain: 0.05, freq: 180, delay, bus: musicBus }); // kick
    if (step % 4 === 2) noise(0.05, { gain: 0.03, freq: 5000, delay, bus: musicBus }); // snare-ish
    step += 1;
    nextTime += len;
  }
}
