// Every number that shapes how the game feels lives here. Tune by doubling and halving.
export const DT = 1 / 60;

export const CAT = {
  hw: 0.36, h: 1.5, proneH: 0.62,
  run: 6.4, accel: 70, airAccel: 44, friction: 60,
  gravity: 36, jumpV: 13.4, jumpCut: 0.45, doubleV: 12, maxFall: 19,
  coyote: 0.1, buffer: 0.12,
  hoverFuel: 0.75, hoverAccel: 52, hoverMaxUp: 3.2,
  recoil: 0.5,
  hearts: 3, invuln: 1.5, hurtStun: 0.28,
  magnet: 1.5,
  rushTime: 9, rushRate: 1.5, rushPush: 1.4, rushSpeed: 1.15,
  respawnDelay: 0.9,
};

// Blasters differ by how they push, not by how much they hurt.
export const BLASTERS = {
  pea:   { rate: 5.6, speed: 18, life: 0.6, dmg: 1.0, push: 5.6, pellets: 1, spread: 0, jitter: 1.5, grav: 3, r: 0.2, pierce: 0, recoil: 1 },
  rapid: { rate: 12.5, speed: 20, life: 0.5, dmg: 0.45, push: 2.5, pellets: 1, spread: 0, jitter: 4.5, grav: 3, r: 0.16, pierce: 0, recoil: 0.5 },
  fan:   { rate: 3.3, speed: 15.5, life: 0.34, dmg: 0.6, push: 4.0, pellets: 5, spread: 40, jitter: 2, grav: 2, r: 0.18, pierce: 0, recoil: 2.2 },
  beam:  { rate: 2.7, speed: 31, life: 0.42, dmg: 1.5, push: 7.5, pellets: 1, spread: 0, jitter: 0, grav: 0, r: 0.24, pierce: 9, recoil: 1.6 },
  fizz:  { rate: 2.1, speed: 11.5, life: 1.4, dmg: 1.6, push: 8.5, pellets: 1, spread: 0, jitter: 2, grav: 22, r: 0.24, pierce: 0, recoil: 1.4, blast: 1.7, loft: 0.42 },
};
export const BLASTER_ORDER = ['pea', 'rapid', 'fan', 'beam', 'fizz'];
export const POINT_BLANK = { age: 0.11, push: 1.6 };

// hp is "grip": how much water a goblin takes before it loses its footing and flies.
export const ENEMIES = {
  runner:   { hp: 2,   mass: 1.0, speed: 2.7, score: 100, hw: 0.36, h: 1.25 },
  sprinter: { hp: 2,   mass: 0.85, speed: 7.2, score: 150, hw: 0.36, h: 1.25 },
  shield:   { hp: 4,   mass: 1.5, speed: 1.6, score: 200, hw: 0.4, h: 1.3, shieldHits: 9 },
  slinger:  { hp: 2,   mass: 1.0, speed: 0,   score: 150, hw: 0.36, h: 1.25 },
  sniper:   { hp: 2,   mass: 1.0, speed: 0,   score: 200, hw: 0.36, h: 1.25 },
  turret:   { hp: 6,   mass: 99,  speed: 0,   score: 300, hw: 0.5, h: 0.75 },
  armored:  { hp: 8,   mass: 2.6, speed: 1.3, score: 300, hw: 0.42, h: 1.35 },
  bomber:   { hp: 2,   mass: 1.0, speed: 1.2, score: 200, hw: 0.36, h: 1.25 },
  balloon:  { hp: 2,   mass: 0.7, speed: 1.7, score: 200, hw: 0.5, h: 1.3 },
};

export const PUSH = {
  launchUp: 8.2, launchSide: 7.5, launchPush: 0.75,   // a goblin that loses its grip
  tumbleTime: 1.6, tumbleGrav: 26,
  bowlDmg: 2.5, bowlKeep: 0.72, bowlRadius: 0.62,
  slamSpeed: 6.5,
  staggerTime: 0.28, groundDrag: 9,
  bombFuse: 1.0, bombRadius: 1.9, bombDmg: 4, bombPush: 10,
};

export const SCORE = {
  cause: { washed: 1, bowled: 2, slammed: 2, dunked: 3, kaboom: 2, shoved: 1.5, popped: 1.5, splash: 1 },
  chainWindow: 2.6, chainMinWindow: 1.1, chainShrink: 0.04, chainStep: 0.25, chainMaxMult: 6,
  coin: 10, sack: 250, kitten: 500, checkpoint: 100, boss: 5000,
  timePerSecond: 20, noKo: 1500,
  slowmoAt: 5,
};

export const SPLASH = { need: 10, speed: 24, dmg: 4, push: 15, height: 4.5 };

export const BOSS = {
  siege_tower:    { hp: 70,  w: 4.2, h: 4.4, weak: [-1.15, 2.55], weakR: 0.62, minion: 'runner' },
  bridge_crusher: { hp: 90,  w: 5.2, h: 4.2, weak: [-0.2, 3.35], weakR: 0.62, minion: 'shield' },
  catapult_fort:  { hp: 110, w: 5.8, h: 4.6, weak: [-1.7, 1.55], weakR: 0.62, minion: 'bomber' },
};

export const VIEW_H = 9; // world units of screen height
