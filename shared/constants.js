// Gemeinsame Konstanten für Client und Server

export const GAME_NAME = 'KUGELHAGEL';

export const TICK_RATE = 30;          // Server-Simulation (Hz)
export const SNAPSHOT_RATE = 30;      // Snapshots an Clients (Hz)
export const CLIENT_SEND_RATE = 30;   // Client -> Server Zustand (Hz)
export const INTERP_DELAY = 100;      // ms Interpolation für andere Spieler
export const MAX_REWIND = 250;        // ms maximale Lag-Kompensation

export const TEAM_SIZE = 5;
export const MAX_PLAYERS = TEAM_SIZE * 2;

export const TEAMS = [
  { id: 0, name: 'KOBRA', color: '#3b8cff', hex: 0x3b8cff },
  { id: 1, name: 'SKORPION', color: '#ff7a1a', hex: 0xff7a1a },
];

export const PLAYER = {
  radius: 0.32,
  standHeight: 1.8,
  crouchHeight: 1.2,
  slideHeight: 0.95,
  eyeFromTop: 0.14,
  maxHealth: 100,
  regenDelay: 4.5,   // s ohne Schaden bis Regeneration
  regenRate: 40,     // HP pro Sekunde
};

export const MOVE = {
  walk: 5.0,
  sprint: 7.1,
  tacSprint: 8.7,
  tacSprintDuration: 3.0,
  tacSprintCooldown: 4.0,
  crouch: 2.7,
  adsMult: 0.62,
  jumpVel: 6.4,
  gravity: 20,
  groundAccel: 13,
  airAccel: 2.6,
  slideBoost: 10.6,
  slideDuration: 0.85,
  slideFriction: 1.15,
  slideCooldown: 0.45,
  stepHeight: 0.52,
  mantleMin: 0.5,
  mantleMax: 1.55,
  mantleTime: 0.32,
};

export const MODES = {
  tdm: { id: 'tdm', name: 'Team-Deathmatch', short: 'TDM', scoreLimit: 75, timeLimit: 600, respawn: 3.5,
    desc: 'Erstes Team mit 75 Kills gewinnt.' },
  dom: { id: 'dom', name: 'Herrschaft', short: 'DOM', scoreLimit: 200, timeLimit: 600, respawn: 4,
    desc: 'Erobere und halte die Flaggen A, B und C.' },
  snd: { id: 'snd', name: 'Suchen & Zerstören', short: 'S&D', roundsToWin: 4, roundTime: 120, respawn: -1,
    bombTime: 40, plantTime: 5, defuseTime: 7, desc: 'Ein Leben pro Runde. Bombe legen oder entschärfen.' },
};

export const STANCE = { stand: 0, crouch: 1, slide: 2 };

export const XP = {
  kill: 100,
  headshot: 25,
  assist: 40,
  capture: 150,
  defendFlag: 50,
  plant: 250,
  defuse: 250,
  win: 500,
  loss: 200,
  roundWin: 100,
  melee: 50,
  firstBlood: 75,
  streak: 50,
};
