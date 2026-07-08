/*
 * toys.js — looping animations built from the klossete wooden block set.
 *
 * Fourteen scenes, held to strict rules:
 *   - at most one instance of each of the five physical blocks
 *   - every motion is integrated real dynamics (rolling constraints,
 *     rigid-body rocking, ballistic flight, torque-free tumbling,
 *     steady precession) — no sine-wave fakery. The one exception is
 *     `stopp`, `gange` and sisyfos's uphill half, which play by stop-motion film rules: held
 *     poses, each a physically stable structure.
 *   - exact contact geometry: pieces touch, they never interpenetrate
 *   - two directional lights (warm key + cool fill), no ambient, no
 *     environment; the isometric camera throughout
 *
 * This file owns the physics and a zero-dependency flat canvas
 * renderer (painter-sorted faces). toys-gl.js renders the same
 * scenes with the real textured GLB models in WebGL.
 *
 * Usage:
 *   <script type="module" src="/toys.js"></script>
 *   <block-toys name="rull"></block-toys>
 *
 * Attributes:
 *   name    a scene from TOYS (required)
 *   mode    "3d" (default) or "2d" — flat face-on silhouettes
 *   scale   px per mm (default 0.55)
 *   title   accessible label
 *
 * All motion is a pure function of u ∈ [0,1), so every loop closes
 * perfectly. Units are millimetres, z is up, the ground is z = 0.
 */

/* ---- the set (dimensions in mm, colors from BLOCKS.md) ---- */

const COLOR = {
  blue: "#2f63cc",       // dark blue planks
  lightblue: "#3f9ec9",  // cube
  red: "#c83a2e",        // cylinder
  orange: "#e07b22",     // orange block
};

function box(w, d, h) {
  const x = w / 2, y = d / 2;
  const v = [
    [-x, -y, 0], [x, -y, 0], [x, y, 0], [-x, y, 0],
    [-x, -y, h], [x, -y, h], [x, y, h], [-x, y, h],
  ];
  return [
    [v[0], v[3], v[2], v[1]], // bottom
    [v[4], v[5], v[6], v[7]], // top
    [v[0], v[1], v[5], v[4]], // -y
    [v[1], v[2], v[6], v[5]], // +x
    [v[2], v[3], v[7], v[6]], // +y
    [v[3], v[0], v[4], v[7]], // -x
  ];
}

function prism(r, h, n = 24) {
  const b = [], t = [], nrm = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    b.push([r * Math.cos(a), r * Math.sin(a), 0]);
    t.push([r * Math.cos(a), r * Math.sin(a), h]);
    nrm.push([Math.cos(a), Math.sin(a), 0]);
  }
  const faces = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const f = [b[i], b[j], t[j], t[i]];
    f.gradN = [nrm[i], nrm[j]]; // smooth-shade the curved side
    faces.push(f);
  }
  faces.push([...t]);            // top
  faces.push([...b].reverse());  // bottom
  return faces;
}

const PLANK75 = box(75, 30, 15);
const PLANK60 = box(60, 30, 15);
const UPRIGHT60 = box(15, 30, 60); // plank60 stood on end
const CUBE = box(30, 30, 30);
const CYL = prism(15, 60);
const ORANGE = box(45, 45, 24);

/* the five physical blocks (upright60 is plank60 stood on end) —
 * `block` identifies the piece for other renderers (toys-gl.js) */
export const SET = {
  plank75: { block: "plank75", mesh: PLANK75, color: COLOR.blue },
  plank60: { block: "plank60", mesh: PLANK60, color: COLOR.blue },
  upright60: { block: "upright60", mesh: UPRIGHT60, color: COLOR.blue },
  cube: { block: "cube", mesh: CUBE, color: COLOR.lightblue },
  cyl: { block: "cyl", mesh: CYL, color: COLOR.red },
  orange: { block: "orange", mesh: ORANGE, color: COLOR.orange },
};

/* ---- transforms: {r: 3x3, t: [x,y,z]} ---- */

const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
/* Rigid transforms only — every piece keeps its true physical size,
 * so normals transform with the same matrix as points. */
const T = (x, y, z) => ({ r: I3, t: [x, y, z] });
const RX = (a) => ({ r: [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]], t: [0, 0, 0] });
const RY = (a) => ({ r: [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]], t: [0, 0, 0] });
const RZ = (a) => ({ r: [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]], t: [0, 0, 0] });

const mulV = (m, v) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];

/* apply a, then b, then c… */
function chain(...ops) {
  return ops.reduce((a, b) => ({
    r: [0, 1, 2].map((i) => [0, 1, 2].map((j) =>
      b.r[i][0] * a.r[0][j] + b.r[i][1] * a.r[1][j] + b.r[i][2] * a.r[2][j])),
    t: [0, 1, 2].map((i) =>
      b.r[i][0] * a.t[0] + b.r[i][1] * a.t[1] + b.r[i][2] * a.t[2] + b.t[i]),
  }));
}

const apply = (xf, p) => {
  const r = mulV(xf.r, p);
  return [r[0] + xf.t[0], r[1] + xf.t[1], r[2] + xf.t[2]];
};

const piece = (def, ...ops) =>
  ({ ...def, xf: ops.length ? chain(...ops) : T(0, 0, 0) });

/* ---- integrated dynamics ----
 *
 * Each scene's motion is the solution of its equation of motion,
 * integrated once at module load into a lookup table and sampled
 * by u. Loops close exactly because the dynamics are conservative
 * and the choreography is time-symmetric (or strictly periodic).
 */

/* integrate s'' = acc(s) from rest at s0 until v drops back to 0
 * or s reaches sMax; returns positions sampled at a fixed dt */
function rollout(acc, s0, sMax = Infinity, dt = 1e-3, maxSteps = 1e6) {
  const out = [s0];
  let s = s0, v = 0;
  for (let i = 0; i < maxSteps; i++) {
    // velocity Verlet
    const a0 = acc(s);
    s += v * dt + 0.5 * a0 * dt * dt;
    v += 0.5 * (a0 + acc(s)) * dt;
    out.push(s);
    if (s >= sMax || (i > 2 && v <= 0)) break;
  }
  return { s: out, T: (out.length - 1) * dt, dt };
}

/* sample a rollout at time t with linear interpolation */
function at(traj, t) {
  const x = Math.min(Math.max(t / traj.dt, 0), traj.s.length - 1);
  const i = Math.min(Math.floor(x), traj.s.length - 2);
  return traj.s[i] + (traj.s[i + 1] - traj.s[i]) * (x - i);
}

/* ================================================================
 * rull — the valley
 *
 * The red cylinder rolls down the long plank, hops the lip, crosses
 * the floor, climbs the short plank, and rolls back — forever.
 * The set conspires: 30/75 = 24/60, so a plank75 resting on the cube
 * and a plank60 resting on the orange block make exactly the same
 * ramp angle. Rolling without slipping throughout (a = ⅔·g·sinθ for
 * a solid cylinder), with an energy-conserving pivot around each
 * ramp's tip edge. Time-symmetric, so the loop closes exactly.
 * ================================================================ */

const RULL = (() => {
  const OVER = 8;                       // plank overhang past the cube edge
  const SIN = 30 / (75 - OVER);         // ramp angle: sinθ = 0.44776…
  const COS = Math.sqrt(1 - SIN * SIN);
  const TH = Math.asin(SIN);
  const R = 15;                         // cylinder radius
  const TIP = 40;                       // ramp tips at x = ∓TIP
  const CLIMB = 38;                     // rest point, up each top face
  const G = 900;                        // toy gravity, mm/s²

  // tip edges of the two top faces (the lips the cylinder pivots on)
  const EL = [-TIP + R * SIN, R * COS];
  const ER = [TIP - R * SIN, R * COS];
  // pivot sweep: from ramp-normal until the cylinder touches ground
  const DEND = Math.acos(1 - COS);
  const ARC = R * (DEND - TH);
  const XGL = EL[0] + R * Math.sin(DEND); // touchdown points
  const XGR = ER[0] - R * Math.sin(DEND);

  // path coordinate s: 0 at rest on the left ramp, rising rightward
  const S1 = CLIMB, S2 = S1 + ARC, S3 = S2 + (XGR - XGL), S4 = S3 + ARC;
  const SEND = S4 + CLIMB;

  // slope of the centre's height along the path — the whole equation
  // of motion, since kinetic energy is ¾mv² in every mode (rolling
  // on a plane and pivoting about an edge share I/mr² = ½)
  const dz = (s) =>
    s < S1 ? -SIN :
    s < S2 ? -Math.sin(TH + (s - S1) / R) :
    s < S3 ? 0 :
    s < S4 ? Math.sin(DEND - (s - S3) / R) :
    SIN;
  const traj = rollout((s) => -(2 / 3) * G * dz(s), 0, SEND);

  // centre position + accumulated spin from the path coordinate
  const pose = (s) => {
    s = Math.min(Math.max(s, 0), SEND);
    let c;
    if (s < S1) {
      const sr = CLIMB - s;
      c = [EL[0] - COS * sr + R * SIN, EL[1] + SIN * sr + R * COS];
    } else if (s < S2) {
      const d = TH + (s - S1) / R;
      c = [EL[0] + R * Math.sin(d), EL[1] + R * Math.cos(d)];
    } else if (s < S3) {
      c = [XGL + (s - S2), R];
    } else if (s < S4) {
      const d = DEND - (s - S3) / R;
      c = [ER[0] - R * Math.sin(d), ER[1] + R * Math.cos(d)];
    } else {
      const sr = s - S4;
      c = [ER[0] + COS * sr - R * SIN, ER[1] + SIN * sr + R * COS];
    }
    return { c, spin: s / R };
  };

  return { SIN, COS, TH, TIP, OVER, EL, ER, SEND, traj, pose };
})();

/* ================================================================
 * vugge — the metronome
 *
 * The short plank stands on end on the long plank and rocks from
 * bottom edge to bottom edge: Housner's rocking block, integrated
 * exactly. Energy carries it through the vertical, the edge swap
 * at flat is elastic, and the rest of the family sits and watches.
 * ================================================================ */

const VUGGE = (() => {
  const W = 7.5, H = 30;                   // half-width, half-height
  const RG = Math.hypot(W, H);             // edge → centre of mass
  const BETA = Math.atan2(W, H);           // tipping angle
  const I = (15 * 15 + 60 * 60) / 12 + RG * RG; // inertia/m about an edge
  const PHI0 = 0.62 * BETA;                // rocking amplitude
  const G = 560;                           // toy gravity, mm/s²

  // quarter period: released at φ0 on one edge, falling to flat.
  // φ'' = -(G·R/I)·sin(β − φ); integrated in s = φ0 − φ so the
  // rollout runs forward, from rest to the flat position s = φ0
  const traj = rollout((s) => (G * RG / I) * Math.sin(BETA - PHI0 + s), 0, PHI0);
  const fall = (t) => PHI0 - at(traj, t); // φ0 → 0 over one quarter

  // signed tilt over one full period (4 quarters), u ∈ [0,1)
  const tilt = (u) => {
    const q = Math.floor(u * 4), t = (u * 4 - q) * traj.T;
    if (q === 0) return fall(t);            // on the right edge, falling
    if (q === 1) return -fall(traj.T - t);  // through flat, up the left
    if (q === 2) return -fall(t);           // back down the left edge
    return fall(traj.T - t);                // and up the right again
  };

  return { W, PHI0, traj, tilt };
})();

/* ================================================================
 * kanon — the rocking canon
 *
 * All five blocks rock on their bottom edges — Housner's rocking
 * block, integrated per piece — with amplitudes solved so their
 * periods lock to 4, 5, 6, 7 and 8 cycles per loop. They start in
 * step, drift into a travelling wave, and snap back together.
 * ================================================================ */

/* planar rocking block: half-width w, half-height h, I_cm/m about
 * the rocking axis icm; pivots on the bottom edges at x = ±w.
 * φ'' = -(gR/(icm+R²))·sin(β − φ), integrated in s = φ0 − φ */
function rocker(w, h, icm, g) {
  const R = Math.hypot(w, h);
  const BETA = Math.atan2(w, h);
  const IE = icm + R * R;
  const quarter = (phi0) =>
    rollout((s) => (g * R / IE) * Math.sin(BETA - phi0 + s), 0, phi0, 2e-4);
  return { BETA, quarter };
}

/* the amplitude whose quarter-period hits tq (period grows with
 * amplitude, diverging at β — so any target is reachable) */
function amplitudeFor(rk, tq) {
  let lo = rk.BETA * 0.02, hi = rk.BETA * 0.985;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (rk.quarter(mid).T < tq) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* signed rocking tilt over one period from a falling-quarter table */
function rockTilt(traj, phi0, p) {
  const q = Math.floor(p * 4), t = (p * 4 - q) * traj.T;
  const fall = (tt) => phi0 - at(traj, tt);
  if (q === 0) return fall(t);
  if (q === 1) return -fall(traj.T - t);
  if (q === 2) return -fall(t);
  return fall(traj.T - t);
}

const KANON = (() => {
  const G = 560;   // toy gravity, mm/s²
  const L = 6;     // loop length, s
  // per piece: pivot half-width, half-height, I_cm/m in the rocking
  // plane, cycles per loop (slow for the tall, quick for the flat)
  const DEFS = [
    { set: "plank75", w: 37.5, h: 7.5, icm: (75 * 75 + 15 * 15) / 12, k: 8, x: -88, y: -18 },
    { set: "cube", w: 15, h: 15, icm: (30 * 30 + 30 * 30) / 12, k: 7, x: -44, y: 22 },
    { set: "cyl", w: 15, h: 30, icm: (3 * 15 * 15 + 60 * 60) / 12, k: 4, x: 0, y: -20 },
    { set: "orange", w: 22.5, h: 12, icm: (45 * 45 + 24 * 24) / 12, k: 6, x: 44, y: 24 },
    { set: "upright60", w: 7.5, h: 30, icm: (15 * 15 + 60 * 60) / 12, k: 5, x: 88, y: -22 },
  ];
  return DEFS.map((d) => {
    const rk = rocker(d.w, d.h, d.icm, G);
    const phi0 = amplitudeFor(rk, L / (4 * d.k));
    return { ...d, phi0, traj: rk.quarter(phi0) };
  });
})();

/* ================================================================
 * flaske — spin the bottle
 *
 * The red cylinder in steady precession, rolling on its rim without
 * slipping: tilt θ and the contact circle stay fixed while the whole
 * pattern turns at Ω. The no-slip constraint gives the spin
 * ω_rel = −Ω·p/r, and the moment balance about the centre of mass
 *   Ω·(I_a·s − I_t·Ω·cosθ)·sinθ = Ω²·(r·sinθ+h·cosθ)·(b+h·sinθ)·m
 *                                  − m·g·(r·cosθ − h·sinθ)
 * fixes Ω. The contact circle p = b + r·cosθ is chosen equal to r,
 * so the net twist per precession is exactly −2π and even the wood
 * grain loops seamlessly.
 * ================================================================ */

const FLASKE = (() => {
  const G = 700;                     // toy gravity, mm/s²
  const TH = 14 * Math.PI / 180;     // tilt of the axis
  const R = 15, H = 60, HC = 30;     // radius, height, centre height
  const IA = R * R / 2;              // I/m about the symmetry axis
  const IT = (3 * R * R + H * H) / 12; // I/m transverse, about CoM
  const S = Math.sin(TH), C = Math.cos(TH);
  const B = R * (1 - C);             // base-centre offset: p = r exactly
  const OM = Math.sqrt(
    G * (R * C - HC * S) /
    ((IA * B / R + IT * C) * S + (R * S + HC * C) * (B + HC * S)));
  return { TH, R, B, S, OM, dur: 2 * Math.PI / OM };
})();

/* ================================================================
 * fontene — the bouncing ensemble
 *
 * Three pieces in elastic ballistic bounce with periods locked
 * 2:3:4 — the cylinder somersaults end over end, the cube does one
 * full flip per hop, the orange block helicopters on a vertical
 * axis. Constant angular velocity throughout (bounces are flat and
 * exert no torque), so every landing is exactly flat.
 * ================================================================ */

const FONTENE = (() => {
  const G = 900;   // toy gravity, mm/s²
  const L = 1.8;   // loop length, s
  // ballistic height above rest for k bounces per loop, phase f
  const hop = (u, k, f) => {
    const p = ((u + f) * k) % 1;
    const T = L / k, t = p * T;
    return (G * T / 2) * t - 0.5 * G * t * t;
  };
  return { G, L, hop };
})();

/* ================================================================
 * kron — heads or tails
 *
 * The red cylinder flips end over end on the orange block: exact
 * parabolic flight, half a turn of constant spin per flight, landing
 * on the opposite face every time. One loop is two flights — one
 * heads, one tails.
 * ================================================================ */

const KRON = (() => {
  const G = 1400;                   // toy gravity, mm/s²
  const TF = 0.55;                  // one flight, s
  const Z0 = 24 + 30;               // resting centre height on the anvil
  const zc = (t) => (G * TF / 2) * t - 0.5 * G * t * t;
  return { G, TF, Z0, zc };
})();

/* ================================================================
 * terning — the die
 *
 * A cube's inertia tensor is isotropic, so torque-free rotation
 * about ANY fixed axis is uniform. Spin it about its body diagonal
 * at exactly 120° per flight: it tumbles corner over corner like a
 * thrown die, yet every landing is exactly flat, because a third of
 * a turn about the diagonal is a symmetry of the cube. Three
 * flights bring even the wood grain home.
 * ================================================================ */

const TERNING = (() => {
  const G = 1200;                        // toy gravity, mm/s²
  const TF = Math.sqrt(8 * 42 / G);      // one flight: 42 mm apex
  const hop = (p) => {
    const t = p * TF;
    return (G * TF / 2) * t - 0.5 * G * t * t;
  };
  return { TF, hop };
})();

/* ================================================================
 * flipper — the court
 *
 * The cube ping-pongs inside a court: an elastic floor bounce at
 * centre, then it kisses a wall exactly at each apex — the standing
 * plank on the left, the red cylinder on the right — reversing only
 * its horizontal velocity, alternating sides forever. Every impulse
 * passes through the centre of mass, so it never rotates at all.
 * ================================================================ */

const FLIPPER = (() => {
  const G = 1200;                        // toy gravity, mm/s²
  const H = 28;                          // apex height above rest
  const TZ = Math.sqrt(8 * H / G);       // floor-bounce period
  const L2 = 55;                         // apex reach: walls at ±L2
  // u ∈ [0,1) covers two floor bounces: right apex, then left apex
  const pose = (u) => {
    const p = (u * 2) % 1, side = u < 0.5 ? 1 : -1;
    const t = p * TZ;
    const z = (G * TZ / 2) * t - 0.5 * G * t * t;
    // out to the wall at apex, back to centre at the next bounce
    const x = side * L2 * (p < 0.5 ? p * 2 : 2 - p * 2);
    return { x, z };
  };
  return { L2, pose };
})();

/* ================================================================
 * skru — the Dzhanibekov flip
 *
 * plank60's three moments of inertia all differ, and its somersault
 * axis (the width) is the unstable intermediate one. Tossed with
 * spin (ε, W, 0), it tumbles and half-twists — the Dzhanibekov
 * effect, integrated from Euler's equations. ε was solved by
 * shooting so that after one ω-period the net rotation about the
 * angular-momentum axis is exactly zero: the plank lands flat, with
 * its launch spin, and the loop is one true tumbling flight.
 * ================================================================ */

const SKRU = (() => {
  const I = [93.75, 318.75, 375];  // I/m about length, width, thickness
  const EPS = 2.09767710;          // the shooting root: α(ε) = 0
  const W = 4 * Math.PI;           // somersault rate about the width axis
  const P = 1.572320;              // one ω-period = one flight, s
  const G = 520;                   // toy gravity, mm/s²

  // integrate q̇ = ½q⊗ω, Iω̇ = (Iω)×ω over one flight (RK4)
  const deriv = (s) => {
    const [q0, q1, q2, q3, w1, w2, w3] = s;
    return [
      0.5 * (-q1 * w1 - q2 * w2 - q3 * w3),
      0.5 * (q0 * w1 + q2 * w3 - q3 * w2),
      0.5 * (q0 * w2 + q3 * w1 - q1 * w3),
      0.5 * (q0 * w3 + q1 * w2 - q2 * w1),
      (I[1] - I[2]) * w2 * w3 / I[0],
      (I[2] - I[0]) * w3 * w1 / I[1],
      (I[0] - I[1]) * w1 * w2 / I[2],
    ];
  };
  const N = 4000, dt = P / N;
  const quats = [];
  let s = [1, 0, 0, 0, EPS, W, 0];
  for (let i = 0; i <= N; i++) {
    quats.push([s[0], s[1], s[2], s[3]]);
    const k1 = deriv(s);
    const k2 = deriv(s.map((v, j) => v + 0.5 * dt * k1[j]));
    const k3 = deriv(s.map((v, j) => v + 0.5 * dt * k2[j]));
    const k4 = deriv(s.map((v, j) => v + dt * k3[j]));
    s = s.map((v, j) => v + (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    const n = Math.hypot(s[0], s[1], s[2], s[3]);
    for (let j = 0; j < 4; j++) s[j] /= n;
  }

  // orientation at flight fraction p, as a rigid transform
  const orient = (p) => {
    const [q0, q1, q2, q3] = quats[Math.round(Math.min(1, Math.max(0, p)) * N)];
    return { r: [
      [1 - 2 * (q2 * q2 + q3 * q3), 2 * (q1 * q2 - q0 * q3), 2 * (q1 * q3 + q0 * q2)],
      [2 * (q1 * q2 + q0 * q3), 1 - 2 * (q1 * q1 + q3 * q3), 2 * (q2 * q3 - q0 * q1)],
      [2 * (q1 * q3 - q0 * q2), 2 * (q2 * q3 + q0 * q1), 1 - 2 * (q1 * q1 + q2 * q2)],
    ], t: [0, 0, 0] };
  };
  const zf = (p) => {
    const t = p * P;
    return (G * P / 2) * t - 0.5 * G * t * t;
  };
  return { P, orient, zf };
})();

/* ================================================================
 * piruett — the cube en pointe
 *
 * A cube's inertia tensor is isotropic, so it spins about ANY axis
 * without wobble — and balanced on its corner with the body diagonal
 * vertical, gravity passes through the contact point and exerts no
 * torque. Steady rotation on the tip of the red column is an exact
 * solution: the humblest block does a perfect pirouette.
 * ================================================================ */

const PIRUETT = (() => {
  const DIAG = Math.atan(Math.SQRT2);        // 54.7356°: diagonal → vertical
  const RAD = 15 * Math.sqrt(3);             // centre to corner
  // rotation taking the body diagonal (1,1,1)/√3 to ẑ: rotate by
  // −DIAG about the (1,−1,0)/√2 axis = RZ(−45°)·RY(−DIAG)·RZ(45°)
  const UP = chain(RZ(-Math.PI / 4), RY(-DIAG), RZ(Math.PI / 4));
  return { RAD, UP };
})();

/* ================================================================
 * stopp — stop motion
 *
 * The one scene that plays by film rules instead of physics rules:
 * the set rebuilds itself — tower, bridge, gate — one block moved
 * per frame at 5 fps, hovering hand-held between placements the way
 * stop-motion pieces do. Every *held* pose is a physically stable,
 * exactly stacked structure.
 * ================================================================ */

const STOPP = (() => {
  const FPS = 5;
  // deck lean: resting on the cube pier's top edge (z=30) with its
  // far end's bottom edge sitting flat on the orange pier (z=24)
  const THB = Math.atan(6 / 53);
  const upright = (x, y) => [RY(-Math.PI / 2), T(x + 7.5, y, 30)];
  // three structures; every held pose is stable and exactly stacked
  // each structure gets its own patch of floor, so half-built ones
  // never share ground with what still stands
  const TOWER = {
    plank75: [T(0, 0, 0)],                                  // base
    orange: [T(0, 0, 15)],                                  // 15..39
    cube: [T(0, 0, 39)],                                    // 39..69
    cyl: [T(0, 0, 69)],                                     // 69..129, spire
    plank60: [T(-78, 40, 0)],                               // spare part
  };
  const BRIDGE = {
    cube: [T(-38, -52, 0)],                                 // tall pier
    orange: [T(44, -52, 0)],                                // short pier
    plank75: [RY(THB), T(-7.26, -52, 28.22)],               // leaning deck
    cyl: [T(-80, -6, 0)],                                   // standing by
    plank60: [T(66, 6, 0)],                                 // lying by
  };
  const GATE = {
    plank60: upright(-30, 52),                              // column, on end
    cyl: [T(30, 52, 0)],                                    // column, 60 too
    plank75: [T(0, 52, 60)],                                // level lintel
    cube: [T(-4, -48, 0)],                                  // just walked through
    orange: [T(58, -44, 0)],
  };
  const CONFIGS = [TOWER, BRIDGE, GATE];
  // one block per frame, in construction order: bases before decks,
  // spires last — every intermediate still-frame stands on its own
  const ORDERS = [
    ["cyl", "cube", "orange", "plank75", "plank60"],  // tower → bridge
    ["plank60", "cyl", "plank75", "cube", "orange"],  // bridge → gate
    ["plank75", "orange", "cube", "cyl", "plank60"],  // gate → tower
  ];

  // unfold into per-frame poses: hold each structure, then move one
  // block per two frames (a hand-held hover, then the placement)
  const frames = [];
  const HOLD = 4;
  for (let c = 0; c < CONFIGS.length; c++) {
    const from = CONFIGS[c], to = CONFIGS[(c + 1) % CONFIGS.length];
    for (let h = 0; h < HOLD; h++) frames.push({ ...from });
    const pose = { ...from };
    for (const b of ORDERS[c]) {
      // hover: lifted and tipped between the two placements
      const pa = chain(...from[b]).t, pb = chain(...to[b]).t;
      pose[b] = [RY(0.14), T((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2,
        Math.max(pa[2], pb[2]) + 66)];
      frames.push({ ...pose });
      pose[b] = to[b];
      frames.push({ ...pose });
    }
  }
  return { frames, dur: frames.length / FPS };
})();

/* ================================================================
 * gange — the walk
 *
 * Stop motion again: the short plank tip-walks end over end — stand,
 * tip, lie, tip, stand — two steps out and two steps home, held at
 * 5 fps. The turnaround is free, because a standing plank looks the
 * same from both sides.
 * ================================================================ */

const GANGE = (() => {
  const FPS = 5;
  // key poses for plank60; x is the trailing edge of the footprint
  const stand = (x) => [RY(-Math.PI / 2), T(x + 7.5, 0, 30)];
  const lie = (x) => [T(x + 30, 0, 0)];
  // mid-tips: the lying pose rotated 45° up about a bottom edge —
  // about its trailing edge falling forward, its leading edge rising
  const midA = (x) => [T(30, 0, 0), RY(-Math.PI / 4), T(x, 0, 0)];
  const midB = (x) => [T(-30, 0, 0), RY(Math.PI / 4), T(x, 0, 0)];
  const step = (x) => [stand(x), midA(x + 15), lie(x + 15), midB(x + 75)];
  const out = [...step(-90), ...step(-15), stand(60)];
  const frames = [...out, ...out.slice(1, -1).reverse(), out[0]];
  return { frames, dur: frames.length / FPS };
})();

/* ================================================================
 * sisyfos — the boulder
 *
 * Two rule books in one scene. Uphill is stop motion: the cube
 * shoulders the cylinder up the ramp one held frame at a time,
 * the spin always consistent with rolling backward. At the top it
 * steps aside — and downhill is real integrated dynamics: the
 * cylinder rolls away (a = ⅔·g·sinθ, no slip), pivots the lip,
 * crosses the floor, and stops dead against the chock with an
 * inelastic wooden thud. Then the work begins again.
 * ================================================================ */

const SISYFOS = (() => {
  const OVER = 8;
  const SIN = 24 / (75 - OVER);        // plank75 resting on the orange block
  const COS = Math.sqrt(1 - SIN * SIN);
  const TH = Math.asin(SIN);
  const R = 15;
  const TIPX = 10;                     // ramp tip edge on the ground
  const CLIMB = 42;                    // release point up the top face
  const G = 900;
  const FPS = 5;

  // top-face tip edge and pivot sweep, as in rull
  const E = [TIPX + R * SIN, R * COS];
  const DEND = Math.acos(1 - COS);
  const ARC = R * (DEND - TH);
  const XG = E[0] + R * Math.sin(DEND);        // touchdown
  const CHOCK = 82;                            // chock face: stop centre + R
  const S1 = CLIMB, S2 = S1 + ARC;
  const SEND = S2 + (CHOCK - R - XG);          // inelastic stop at the chock

  const dz = (s) =>
    s < S1 ? -SIN :
    s < S2 ? -Math.sin(TH + (s - S1) / R) : 0;
  const traj = rollout((s) => -(2 / 3) * G * dz(s), 0, SEND);

  const pose = (s) => {
    s = Math.min(Math.max(s, 0), SEND);
    let c;
    if (s < S1) {
      const sr = CLIMB - s;
      c = [E[0] - COS * sr + R * SIN, E[1] + SIN * sr + R * COS];
    } else if (s < S2) {
      const d = TH + (s - S1) / R;
      c = [E[0] + R * Math.sin(d), E[1] + R * Math.cos(d)];
    } else {
      c = [XG + (s - S2), R];
    }
    return { c, spin: s / R };
  };

  // timeline: N_PUSH held frames uphill, one step-aside frame,
  // then the continuous roll, then rest while the pusher walks back
  const N_PUSH = 10, N_REST = 4;
  const T_PUSH = (N_PUSH + 1) / FPS;
  const T_REST = N_REST / FPS;
  const dur = T_PUSH + traj.T + T_REST;

  // pusher poses: atop the chock at the bottom, then on the floor
  // behind the roller, then held against the ramp face uphill
  const cubePush = (s) => {
    const { c } = pose(s);
    // roller up the ramp: no floor behind it, so the pusher marches
    // alongside the hill, level with the boulder
    if (s < S1 - 4) return [T(c[0] + 8, 48, 0)];
    if (c[0] + R + 32 > CHOCK - 2) return [T(CHOCK + 15, 0, 15)]; // on the chock
    return [T(c[0] + R + 17, 0, 0)];
  };
  return { SIN, COS, TH, TIPX, OVER, SEND, traj, pose, cubePush,
    N_PUSH, N_REST, FPS, T_PUSH, dur, CHOCK };
})();

/* ================================================================
 * sprett — the somersault
 *
 * The orange block bounces on the cube's top face: exact ballistic
 * flight (z̈ = −g), one full torque-free somersault per flight at
 * constant angular velocity, and an elastic instantaneous bounce.
 * It leaves flat and one revolution later it lands flat.
 * ================================================================ */

const SPRETT = (() => {
  const G = 1400;                   // toy gravity, mm/s²
  const TF = 0.64;                  // flight time, s
  const Z0 = 45 + 12;               // resting centre height on the cube
  const V0 = G * TF / 2;            // launch speed for a TF flight
  const zc = (t) => Z0 + V0 * t - 0.5 * G * t * t;
  return { G, TF, Z0, zc, apex: Z0 + G * TF * TF / 8 };
})();

/* ---- the scenes ---- */

export const TOYS = {

  /* the cylinder rolling the valley between the two planks */
  rull: {
    dur: 2 * RULL.traj.T,
    ext: { r: 148, z: 78 },
    scene: (u) => {
      const { SIN, COS, TH, TIP, OVER, traj, pose } = RULL;
      // palindrome in time: out on the first half, home on the second;
      // position and spin both retrace with the path coordinate
      const tau = u < 0.5 ? u * 2 : 2 - u * 2;
      const { c, spin } = pose(at(traj, tau * traj.T));
      return [
        // long ramp: tip edge on the ground at -TIP, resting on the cube
        piece(SET.plank75, RY(TH), T(-TIP - 37.5 * COS, 0, 37.5 * SIN)),
        piece(SET.cube, T(-TIP - (75 - OVER) * COS - 15, 0, 0)),
        // short ramp: tip edge at +TIP, resting on the orange block
        piece(SET.plank60, RY(-TH), T(TIP + 30 * COS, 0, 30 * SIN)),
        piece(SET.orange, T(TIP + (60 - OVER * 0.8) * COS + 22.5, 0, 0)),
        // the roller: axis along y, spun by its own arc length
        piece(SET.cyl, T(0, 0, -30), RX(Math.PI / 2),
          RY(spin), T(c[0], 0, c[1])),
      ];
    },
  },

  /* the rocking plank, keeping time for the family */
  vugge: {
    dur: 4 * VUGGE.traj.T,
    ext: { r: 92, z: 104 },
    scene: (u) => {
      const phi = VUGGE.tilt(u);
      const e = phi >= 0 ? VUGGE.W : -VUGGE.W; // pivot edge under the lean
      return [
        // the pedestal: long plank, orange block, and the rocker on top
        piece(SET.plank75),
        piece(SET.orange, T(0, 0, 15)),
        piece(SET.upright60, T(-e, 0, 0), RY(phi), T(e, 0, 39)),
        // the audience, sitting this one out
        piece(SET.cube, T(-58, 42, 0)),
        piece(SET.cyl, T(68, -22, 0)),
      ];
    },
  },

  /* the whole family rocking in a phase canon */
  kanon: {
    dur: 6,
    ext: { r: 136, z: 66 },
    scene: (u) => KANON.map((d) => {
      const phi = rockTilt(d.traj, d.phi0, (u * d.k) % 1);
      const e = phi >= 0 ? d.w : -d.w;
      return piece(SET[d.set], T(-e, 0, 0), RY(phi), T(e + d.x, d.y, 0));
    }),
  },

  /* spin the bottle: the cylinder wobbling in steady precession */
  flaske: {
    dur: FLASKE.dur,
    ext: { r: 108, z: 78 },
    scene: (u) => {
      const { TH, R, B, S } = FLASKE;
      const psi = u * Math.PI * 2;
      return [
        // rolling without slipping: net twist −ψ, tilt θ, precession ψ
        piece(SET.cyl, RZ(-psi), RY(TH), T(B, 0, R * S), RZ(psi)),
        // the circle, waiting to see who it lands on
        piece(SET.plank75, T(-6, 84, 0)),
        piece(SET.cube, T(-82, -10, 0)),
        piece(SET.orange, T(58, -60, 0)),
        piece(SET.plank60, RZ(Math.PI / 2), T(84, 34, 0)),
      ];
    },
  },

  /* the bouncing ensemble, periods locked 2:3:4 */
  fontene: {
    dur: FONTENE.L,
    ext: { r: 106, z: 130 },
    scene: (u) => {
      const { hop } = FONTENE;
      return [
        piece(SET.plank75),
        // the cube drums on the plank: one somersault per hop, 3 hops
        piece(SET.cube, T(0, 0, -15), RY(Math.PI * 2 * 3 * u),
          T(0, 0, 30 + hop(u, 3, 0))),
        // the cylinder's long end-over-end toss, 2 flights
        piece(SET.cyl, T(0, 0, -30), RY(Math.PI * 2 * (u + 0.3)),
          T(-62, 30, 30 + hop(u, 2, 0.3))),
        // the orange helicopter, 4 quick hops
        piece(SET.orange, T(0, 0, -12), RZ(Math.PI * 2 * u),
          T(68, -34, 12 + hop(u, 4, 0.125))),
        // one of us stays grounded
        piece(SET.upright60, T(-20, -64, 0)),
      ];
    },
  },

  /* heads or tails, forever */
  kron: {
    dur: 2 * KRON.TF,
    ext: { r: 96, z: 130 },
    scene: (u) => {
      const { TF, Z0, zc } = KRON;
      const t = ((u * 2) % 1) * TF;
      return [
        piece(SET.orange),
        // half a turn per flight: heads, then tails
        piece(SET.cyl, T(0, 0, -30), RY(Math.PI * 2 * u), T(0, 0, Z0 + zc(t))),
        // the bettors
        piece(SET.plank75, T(-8, 66, 0)),
        piece(SET.cube, T(44, -56, 0)),
        piece(SET.upright60, T(-20, -72, 0)),
      ];
    },
  },

  /* the cube's perfect pirouette on the red column */
  piruett: {
    dur: 2.2,
    ext: { r: 96, z: 118 },
    scene: (u) => [
      piece(SET.cyl),
      // corner down, body diagonal vertical, steady spin: exact
      piece(SET.cube, T(0, 0, -15), PIRUETT.UP, RZ(Math.PI * 2 * u),
        T(0, 0, 60 + PIRUETT.RAD)),
      // the corps de ballet
      piece(SET.plank75, T(-12, 72, 0)),
      piece(SET.plank60, T(74, -10, 0)),
      piece(SET.orange, T(26, -68, 0)),
    ],
  },

  /* stop motion: the set rebuilds itself, one block per frame */
  stopp: {
    dur: STOPP.dur,
    ext: { r: 120, z: 200 },
    scene: (u) => {
      const f = STOPP.frames[
        Math.min(STOPP.frames.length - 1, Math.floor(u * STOPP.frames.length))];
      return ["plank75", "orange", "cube", "cyl", "plank60"]
        .map((b) => piece(SET[b], ...f[b]));
    },
  },

  /* the plank takes a little walk */
  gange: {
    dur: GANGE.dur,
    ext: { r: 112, z: 66 },
    scene: (u) => {
      const f = GANGE.frames[
        Math.min(GANGE.frames.length - 1, Math.floor(u * GANGE.frames.length))];
      return [
        piece(SET.plank60, ...f),
        // the neighbours it strolls past
        piece(SET.plank75, T(-20, 62, 0)),
        piece(SET.cube, T(52, -48, 0)),
        piece(SET.orange, T(-20, -78, 0)),
        piece(SET.cyl, T(84, 44, 0)),
      ];
    },
  },

  /* uphill by hand, downhill by physics */
  sisyfos: {
    dur: SISYFOS.dur,
    ext: { r: 122, z: 62 },
    scene: (u) => {
      const { SIN, COS, TH, TIPX, OVER, SEND, traj, pose, cubePush,
        N_PUSH, FPS, T_PUSH, CHOCK } = SISYFOS;
      const t = u * SISYFOS.dur;
      let s;
      if (t < T_PUSH) {
        // stop motion uphill: one held pose per frame, top to bottom
        const k = Math.min(N_PUSH, Math.floor(t * FPS));
        s = SEND * (1 - k / N_PUSH);
      } else {
        // real dynamics downhill, then rest against the chock
        s = at(traj, t - T_PUSH);
      }
      const { c, spin } = pose(s);
      // the pusher: shoulder to the boulder uphill, then walking
      // back around while the boulder rolls
      let cube;
      if (t < T_PUSH) {
        const k = Math.floor(t * FPS);
        cube = k === N_PUSH ? [T(30, 46, 0)] : cubePush(s);
      } else {
        const back = [[30, 46, 0], [56, 44, 0], [86, 34, 0], [CHOCK + 15, 0, 15]];
        const k = Math.min(back.length - 1, Math.floor((t - T_PUSH) * FPS));
        cube = [T(...back[k])];
      }
      return [
        // the hill: plank75 resting on the orange block, tip at TIPX
        piece(SET.plank75, RY(TH), T(TIPX - 37.5 * COS, 0, 37.5 * SIN)),
        piece(SET.orange, T(TIPX - (75 - OVER) * COS - 22.5, 0, 0)),
        piece(SET.plank60, T(CHOCK + 30, 0, 0)),   // the chock
        piece(SET.cyl, T(0, 0, -30), RX(Math.PI / 2), RY(spin), T(c[0], 0, c[1])),
        piece(SET.cube, ...cube),
      ];
    },
  },

  /* the die that always lands flat */
  terning: {
    dur: 3 * TERNING.TF,
    ext: { r: 102, z: 96 },
    scene: (u) => {
      const UPI = chain(RZ(-Math.PI / 4), RY(Math.atan(Math.SQRT2)), RZ(Math.PI / 4));
      return [
        piece(SET.plank75),
        // constant spin about the body diagonal, 120° per flight
        piece(SET.cube, T(0, 0, -15), PIRUETT.UP, RZ(Math.PI * 2 * u), UPI,
          T(0, 0, 30 + TERNING.hop((u * 3) % 1))),
        // the players
        piece(SET.orange, T(44, -56, 0)),
        piece(SET.cyl, T(-64, 28, 0)),
        piece(SET.upright60, T(-16, -74, 0)),
      ];
    },
  },

  /* the cube ping-ponging between the plank and the column */
  flipper: {
    dur: 2 * Math.sqrt(8 * 28 / 1200),
    ext: { r: 108, z: 68 },
    scene: (u) => {
      const { x, z } = FLIPPER.pose(u);
      return [
        piece(SET.upright60, T(-FLIPPER.L2 - 22.5, 0, 0)),  // left wall
        piece(SET.cyl, T(FLIPPER.L2 + 30, 0, 0)),           // right wall
        piece(SET.cube, T(x, 0, z)),                        // the ball
        // the crowd
        piece(SET.plank75, T(20, 44, 0)),
        piece(SET.orange, T(-30, -52, 0)),
      ];
    },
  },

  /* the intermediate-axis theorem, live */
  skru: {
    dur: SKRU.P,
    ext: { r: 96, z: 232 },
    scene: (u) => [
      piece(SET.orange),
      // one exact tumbling flight: somersaults with sudden half-twists
      piece(SET.plank60, T(0, 0, -7.5), SKRU.orient(u),
        T(0, 0, 31.5 + SKRU.zf(u))),
      // the witnesses keep their distance
      piece(SET.plank75, T(-10, 70, 0)),
      piece(SET.cube, T(20, -78, 0)),
      piece(SET.cyl, T(58, -52, 0)),
    ],
  },

  /* the orange block's endless somersault on the cube */
  sprett: {
    dur: SPRETT.TF,
    ext: { r: 92, z: 165 },
    scene: (u) => {
      const t = u * SPRETT.TF;
      return [
        piece(SET.plank75),
        piece(SET.cube, T(0, 0, 15)),
        piece(SET.orange, T(0, 0, -12),
          RY(Math.PI * 2 * u), T(0, 0, SPRETT.zc(t))),
        // the witnesses, wide of the flight path
        piece(SET.cyl, T(52, -52, 0)),
        piece(SET.upright60, T(-56, 48, 0)),
      ];
    },
  },
};

/* ---- camera and the two lights ---- */

const K = Math.SQRT1_2;            // azimuth 45°
const SIN_E = 0.5, COS_E = Math.sqrt(3) / 2; // elevation 30°

const norm3 = (v) => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};

/* two directional lights, nothing else — no ambient, no environment.
 * A warm key from the front upper right, a cool low fill from the
 * back left. Each casts its own hard shadow. */
const LIGHTS = [
  { dir: norm3([0.48, 0.38, 0.85]), rgb: [1.22, 1.08, 0.94], shadow: 0.4 },
  { dir: norm3([-0.62, -0.5, 0.58]), rgb: [0.4, 0.5, 0.68], shadow: 0.15 },
];

/* true isometric view from (+x,+y): a real camera's screen-right axis
 * there is (y−x)/√2, which keeps this projection consistent with the
 * physical camera in toys-gl.js */
const project = ([x, y, z]) => [(y - x) * K, (x + y) * K * SIN_E - z * COS_E];
const nearness = ([x, y, z]) => (x + y) * K * COS_E + z * SIN_E;

function hexRgb(c) {
  c = c.trim().replace("#", "");
  if (c.length === 3) c = [...c].map((x) => x + x).join("");
  const n = parseInt(c, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* gamma-correct Lambert under the two lights; a face turned from
 * both falls to black */
function shade(base, n) {
  const rgb = hexRgb(base);
  return `rgb(${rgb.map((c, i) => {
    let v = 0;
    for (const l of LIGHTS) {
      const lit = Math.max(0, n[0] * l.dir[0] + n[1] * l.dir[1] + n[2] * l.dir[2]);
      v += Math.pow(c / 255, 2.2) * l.rgb[i] * lit;
    }
    return Math.round(255 * Math.pow(Math.min(1, v), 1 / 2.2));
  }).join(",")})`;
}

/* ---- renderer ---- */

export function bounds(ext, scale) {
  const pts = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const z of [0, ext.z]) {
    pts.push(project([sx * ext.r, sy * ext.r, z]));
  }
  // room for the hard shadows of both lights
  for (const l of LIGHTS) {
    const dx = -ext.z * (l.dir[0] / l.dir[2]);
    const dy = -ext.z * (l.dir[1] / l.dir[2]);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      pts.push(project([sx * ext.r + dx, sy * ext.r + dy, 0]));
    }
  }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const pad = 6;
  const minX = Math.min(...xs) * scale - pad, maxX = Math.max(...xs) * scale + pad;
  const minY = Math.min(...ys) * scale - pad, maxY = Math.max(...ys) * scale + pad;
  return { w: maxX - minX, h: maxY - minY, ox: -minX, oy: -minY };
}

export function drawScene(ctx, name, u, scale, inkShadow) {
  const toy = TOYS[name];
  const pieces = toy.scene(u);
  const { ox, oy } = bounds(toy.ext, scale);
  const px = ([x, y]) => [ox + x * scale, oy + y * scale];
  const spx = (v) => px(project(v));

  // world-space faces per piece (rigid transforms, so normals rotate too)
  const solid = pieces.map((p) => {
    const faces = p.mesh.map((f) => {
      const nf = f.map((v) => apply(p.xf, v));
      if (f.gradN) nf.gradN = f.gradN.map((nv) => mulV(p.xf.r, nv));
      return nf;
    });
    const verts = faces.flat();
    let near = 0;
    for (const v of verts) near += nearness(v);
    return { ...p, faces, near: near / verts.length };
  }).sort((a, b) => a.near - b.near);

  // hard shadows: project the geometry to the ground along each light
  ctx.fillStyle = inkShadow;
  for (const l of LIGHTS) {
    for (const p of solid) {
      const path = new Path2D();
      for (const f of p.faces) {
        const pts = f.map((v) => {
          const t = v[2] / l.dir[2];
          return px(project([v[0] - l.dir[0] * t, v[1] - l.dir[1] * t, 0]));
        });
        let area = 0;
        for (let i = 0; i < pts.length; i++) {
          const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
          area += x1 * y2 - x2 * y1;
        }
        const poly = area < 0 ? [...pts].reverse() : pts; // uniform winding
        path.moveTo(poly[0][0], poly[0][1]);
        for (let i = 1; i < poly.length; i++) path.lineTo(poly[i][0], poly[i][1]);
        path.closePath();
      }
      ctx.globalAlpha = l.shadow * (p.alpha ?? 1);
      ctx.fill(path);
    }
  }
  ctx.globalAlpha = 1;

  // then pieces, far to near; faces back to front within each
  for (const p of solid) {
    ctx.globalAlpha = p.alpha ?? 1;
    const drawable = [];
    for (const f of p.faces) {
      const [a, b, c] = f;
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      let n = [
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      ];
      const len = Math.hypot(...n) || 1;
      n = n.map((v) => v / len);
      // toward-camera direction is the gradient of nearness
      if (n[0] * K * COS_E + n[1] * K * COS_E + n[2] * SIN_E <= 0) continue;
      let near = 0;
      for (const v of f) near += nearness(v);
      drawable.push({ f, n, near: near / f.length });
    }
    drawable.sort((a, b) => a.near - b.near);
    for (const { f, n } of drawable) {
      const pts = f.map(spx);
      let fill = null;
      if (f.gradN) {
        // smooth-shade curved sides across the facet
        const m0 = [(pts[0][0] + pts[3][0]) / 2, (pts[0][1] + pts[3][1]) / 2];
        const m1 = [(pts[1][0] + pts[2][0]) / 2, (pts[1][1] + pts[2][1]) / 2];
        if (Math.hypot(m1[0] - m0[0], m1[1] - m0[1]) > 0.5) {
          const g = ctx.createLinearGradient(m0[0], m0[1], m1[0], m1[1]);
          g.addColorStop(0, shade(p.color, f.gradN[0]));
          g.addColorStop(1, shade(p.color, f.gradN[1]));
          fill = g;
        }
      }
      if (!fill) fill = shade(p.color, n);
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.strokeStyle = fill; // hairline overdraw hides AA seams
      ctx.lineWidth = 0.7;
      ctx.lineJoin = "round";
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/* ---- 2d: the same scenes face-on, as flat silhouettes ---- */

export function bounds2d(ext, scale) {
  const pad = 6;
  return {
    w: ext.r * 2 * scale + pad * 2,
    h: ext.z * scale + pad * 2 + 5,
    ox: ext.r * scale + pad,
    oy: ext.z * scale + pad,
  };
}

export function drawScene2d(ctx, name, u, scale, inkShadow) {
  const toy = TOYS[name];
  const pieces = toy.scene(u);
  const b = bounds2d(toy.ext, scale);
  const px = (v) => [b.ox + v[0] * scale, b.oy - v[2] * scale];

  const solid = pieces.map((p) => {
    const faces = p.mesh.map((f) => f.map((v) => apply(p.xf, v)));
    let ySum = 0, count = 0, minX = Infinity, maxX = -Infinity, minZ = Infinity;
    for (const f of faces) for (const v of f) {
      ySum += v[1]; count++;
      minX = Math.min(minX, v[0]); maxX = Math.max(maxX, v[0]);
      minZ = Math.min(minZ, v[2]);
    }
    return { ...p, faces, y: ySum / count, minX, maxX, minZ };
  }).sort((a, b2) => b2.y - a.y); // camera at -y: draw the far side first

  // ground shadow bars, one per light, nudged its way and fading with altitude
  ctx.fillStyle = inkShadow;
  for (const l of LIGHTS) {
    for (const p of solid) {
      ctx.globalAlpha = l.shadow * 0.9 * (p.alpha ?? 1) * clamp01(1 - p.minZ / 140);
      const [x0] = px([p.minX, 0, 0]);
      const [x1] = px([p.maxX, 0, 0]);
      const off = -p.minZ * (l.dir[0] / l.dir[2]) * scale;
      ctx.fillRect(x0 + off, b.oy + 1, x1 - x0, 3);
    }
  }
  ctx.globalAlpha = 1;

  // flat silhouettes in the set's own colors
  for (const p of solid) {
    ctx.globalAlpha = p.alpha ?? 1;
    const path = new Path2D();
    for (const f of p.faces) {
      const pts = f.map(px);
      let area = 0;
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
        area += x1 * y2 - x2 * y1;
      }
      const poly = area < 0 ? [...pts].reverse() : pts;
      path.moveTo(poly[0][0], poly[0][1]);
      for (let i = 1; i < poly.length; i++) path.lineTo(poly[i][0], poly[i][1]);
      path.closePath();
    }
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 0.7;
    ctx.lineJoin = "round";
    ctx.fill(path);
    ctx.stroke(path);
  }
  ctx.globalAlpha = 1;
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/* ---- custom element ---- */

if (typeof HTMLElement !== "undefined") {

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)");

class BlockToys extends HTMLElement {
  static observedAttributes = ["mode", "name", "scale"];
  #raf = null;
  #io = null;
  #visible = true;
  #canvas = null;
  #ctx = null;
  #start = performance.now();

  connectedCallback() {
    const name = this.getAttribute("name");
    if (!TOYS[name]) return;
    if (!this.#canvas) {
      this.style.display = "inline-block";
      this.style.lineHeight = "0";
      this.style.verticalAlign = "middle";
      this.setAttribute("role", "img");
      this.setAttribute("aria-label", this.getAttribute("title") || name);
      this.#canvas = document.createElement("canvas");
      this.append(this.#canvas);
      this.#ctx = this.#canvas.getContext("2d");
      this.#io = new IntersectionObserver(([entry]) => {
        this.#visible = entry.isIntersecting;
        this.#sync();
      });
      this.#io.observe(this);
      REDUCED.addEventListener("change", () => this.#sync());
    }
    this.#layout();
    this.#frame();
    this.#sync();
  }

  disconnectedCallback() {
    this.#stop();
    this.#io && this.#io.disconnect();
  }

  attributeChangedCallback() {
    if (!this.#canvas) return;
    this.#layout();
    this.#frame();
  }

  get #mode() { return this.getAttribute("mode") === "2d" ? "2d" : "3d"; }

  get #scale() {
    const s = Number(this.getAttribute("scale"));
    return s > 0 ? s : 0.55;
  }

  #layout() {
    const bfn = this.#mode === "2d" ? bounds2d : bounds;
    const { w, h } = bfn(TOYS[this.getAttribute("name")].ext, this.#scale);
    const dpr = window.devicePixelRatio || 1;
    this.#canvas.width = Math.ceil(w * dpr);
    this.#canvas.height = Math.ceil(h * dpr);
    this.#canvas.style.width = w + "px";
    this.#canvas.style.height = h + "px";
    this.#ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  #frame() {
    const name = this.getAttribute("name");
    const toy = TOYS[name];
    const u = ((performance.now() - this.#start) / 1000 / toy.dur) % 1;
    const { width, height } = this.#canvas;
    this.#ctx.save();
    this.#ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.#ctx.clearRect(0, 0, width, height);
    this.#ctx.restore();
    const ink = getComputedStyle(this).getPropertyValue("--ink").trim() || "#1a1d1b";
    const draw = this.#mode === "2d" ? drawScene2d : drawScene;
    draw(this.#ctx, name, REDUCED.matches ? 0 : u, this.#scale, ink);
  }

  #sync() {
    const run = this.#visible && !REDUCED.matches;
    if (run && this.#raf === null) {
      const tick = () => { this.#frame(); this.#raf = requestAnimationFrame(tick); };
      this.#raf = requestAnimationFrame(tick);
    } else if (!run) {
      this.#stop();
      this.#canvas && this.#frame(); // static first frame
    }
  }

  #stop() {
    if (this.#raf !== null) cancelAnimationFrame(this.#raf);
    this.#raf = null;
  }
}

if (!customElements.get("block-toys")) {
  customElements.define("block-toys", BlockToys);
}

}
