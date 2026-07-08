/*
 * toys.js — looping animations built from the klossete wooden block set.
 *
 * Three scenes, held to strict rules:
 *   - at most one instance of each of the five physical blocks
 *   - every motion is integrated real dynamics (rolling constraint,
 *     rigid-body rocking, ballistic flight) — no sine-wave fakery
 *   - exact contact geometry: pieces touch, they never interpenetrate
 *   - two directional lights (warm key + cool fill), no ambient,
 *     no environment — faces away from both lights fall to black,
 *     and each light casts its own hard shadow
 *
 * No dependencies, no WebGL: a tiny orthographic-isometric engine
 * with painter-sorted faces on a 2d canvas.
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

const piece = (mesh, color, ...ops) =>
  ({ mesh, color, xf: ops.length ? chain(...ops) : T(0, 0, 0) });

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
  const G = 430;                        // toy gravity, mm/s²

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
  const G = 300;                           // toy gravity, mm/s²

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
 * sprett — the somersault
 *
 * The orange block bounces on the cube's top face: exact ballistic
 * flight (z̈ = −g), one full torque-free somersault per flight at
 * constant angular velocity, and an elastic instantaneous bounce.
 * It leaves flat and one revolution later it lands flat.
 * ================================================================ */

const SPRETT = (() => {
  const G = 700;                    // toy gravity, mm/s²
  const TF = 0.9;                   // flight time, s
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
        piece(PLANK75, COLOR.blue, RY(TH), T(-TIP - 37.5 * COS, 0, 37.5 * SIN)),
        piece(CUBE, COLOR.lightblue, T(-TIP - (75 - OVER) * COS - 15, 0, 0)),
        // short ramp: tip edge at +TIP, resting on the orange block
        piece(PLANK60, COLOR.blue, RY(-TH), T(TIP + 30 * COS, 0, 30 * SIN)),
        piece(ORANGE, COLOR.orange, T(TIP + (60 - OVER * 0.8) * COS + 22.5, 0, 0)),
        // the roller: axis along y, spun by its own arc length
        piece(CYL, COLOR.red, T(0, 0, -30), RX(Math.PI / 2),
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
        piece(PLANK75, COLOR.blue),
        piece(ORANGE, COLOR.orange, T(0, 0, 15)),
        piece(UPRIGHT60, COLOR.blue, T(-e, 0, 0), RY(phi), T(e, 0, 39)),
        // the audience, sitting this one out
        piece(CUBE, COLOR.lightblue, T(-58, 42, 0)),
        piece(CYL, COLOR.red, T(68, -22, 0)),
      ];
    },
  },

  /* the orange block's endless somersault on the cube */
  sprett: {
    dur: SPRETT.TF,
    ext: { r: 92, z: 165 },
    scene: (u) => {
      const t = u * SPRETT.TF;
      return [
        piece(PLANK75, COLOR.blue),
        piece(CUBE, COLOR.lightblue, T(0, 0, 15)),
        piece(ORANGE, COLOR.orange, T(0, 0, -12),
          RY(Math.PI * 2 * u), T(0, 0, SPRETT.zc(t))),
        // the witnesses, wide of the flight path
        piece(CYL, COLOR.red, T(52, -52, 0)),
        piece(UPRIGHT60, COLOR.blue, T(-56, 48, 0)),
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
  { dir: norm3([0.56, 0.28, 0.9]), rgb: [1.22, 1.08, 0.94], shadow: 0.4 },
  { dir: norm3([-0.76, -0.3, 0.6]), rgb: [0.4, 0.5, 0.68], shadow: 0.15 },
];

const project = ([x, y, z]) => [(x - y) * K, (x + y) * K * SIN_E - z * COS_E];
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
