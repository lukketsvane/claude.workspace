/*
 * toys.js — looping animations built from the klossete wooden block set.
 *
 * The five physical pieces (see models/BLOCKS.md) rendered as real
 * geometry on a canvas: a tiny orthographic-isometric engine with
 * painter-sorted faces, sun-and-sky shading, and hard cast shadows.
 * No dependencies, no WebGL.
 *
 * Usage:
 *   <script type="module" src="/toys.js"></script>
 *   <block-toys name="carousel"></block-toys>
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

/* ---- easing ---- */

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeOut = (v) => 1 - Math.pow(1 - clamp01(v), 3);
const easeInOut = (v) => {
  v = clamp01(v);
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
};
const window01 = (u, from, len) => clamp01((u - from) / len);

/* ---- the scenes ---- */

export const TOYS = {

  /* pieces riding a slow merry-go-round around the red cylinder */
  carousel: {
    dur: 7, ext: { r: 115, z: 75 },
    scene: (u) => {
      const a = u * Math.PI * 2;
      const rider = (mesh, color, i) => {
        const th = a + (i / 3) * Math.PI * 2;
        const bob = 8 + 6 * Math.sin(a * 2 + i * 2.1);
        return piece(mesh, color, RZ(th + Math.PI / 2),
          T(80 * Math.cos(th), 80 * Math.sin(th), bob));
      };
      return [
        piece(CYL, COLOR.red),
        rider(CUBE, COLOR.lightblue, 0),
        rider(ORANGE, COLOR.orange, 1),
        rider(PLANK60, COLOR.blue, 2),
      ];
    },
  },

  /* a tower that builds itself, then takes itself down */
  tower: {
    dur: 6, ext: { r: 55, z: 175 },
    scene: (u) => {
      const tau = u < 0.5 ? u * 2 : (1 - u) * 2; // palindrome
      const drop = (mesh, color, rest, slot) => {
        const p = easeOut(window01(tau, slot * 0.16, 0.2));
        return piece(mesh, color, T(0, 0, rest + (1 - p) * (175 - rest)));
      };
      return [
        drop(PLANK75, COLOR.blue, 0, 0),
        drop(CUBE, COLOR.lightblue, 15, 1),
        drop(ORANGE, COLOR.orange, 45, 2),
        drop(CYL, COLOR.red, 69, 3),
      ];
    },
  },

  /* the long plank rocking on the cube, passengers riding the ends */
  seesaw: {
    dur: 4, ext: { r: 60, z: 85 },
    scene: (u) => {
      const a = 0.2 * Math.sin(u * Math.PI * 2);
      const onPlank = (mesh, color, x) =>
        piece(mesh, color, T(x, 0, 15), RY(a), T(0, 0, 30));
      return [
        piece(CUBE, COLOR.lightblue),
        piece(PLANK75, COLOR.blue, RY(a), T(0, 0, 30)),
        onPlank(ORANGE, COLOR.orange, -26),
        onPlank(CYL, COLOR.red, 28),
      ];
    },
  },

  /* a standing plank ticking like a metronome */
  metronome: {
    dur: 3, ext: { r: 55, z: 85 },
    scene: (u) => {
      const a = 0.3 * Math.sin(u * Math.PI * 2);
      return [
        piece(ORANGE, COLOR.orange),
        piece(UPRIGHT60, COLOR.blue, RY(a), T(0, 0, 24)),
      ];
    },
  },

  /* the orange block bouncing with squash and stretch */
  bounce: {
    dur: 2.4, ext: { r: 55, z: 110 },
    scene: (u) => {
      const h = Math.abs(Math.sin(u * Math.PI * 2)); // two bounces
      const z = 15 + 70 * h * h;
      // square footprint: a quarter turn per loop closes seamlessly
      return [
        piece(PLANK75, COLOR.blue),
        piece(ORANGE, COLOR.orange, RZ(u * Math.PI / 2), T(0, 0, z)),
      ];
    },
  },

  /* the cylinder rolling back and forth along two planks */
  roll: {
    dur: 5, ext: { r: 85, z: 40 },
    scene: (u) => {
      const x = 25 * Math.sin(u * Math.PI * 2);
      return [
        piece(PLANK75, COLOR.blue, T(-37.5, 0, 0)),
        piece(PLANK75, COLOR.blue, T(37.5, 0, 0)),
        piece(CYL, COLOR.red, RZ(-x / 15), RY(Math.PI / 2), T(x - 30, 0, 30)),
      ];
    },
  },

  /* the orange block doing a lazy somersault */
  flip: {
    dur: 3, ext: { r: 45, z: 115 },
    scene: (u) => {
      const z = 30 + 45 * Math.pow(Math.sin(u * Math.PI), 2);
      return [
        piece(ORANGE, COLOR.orange, T(0, 0, -12), RY(u * Math.PI * 2), T(0, 0, z + 12)),
      ];
    },
  },

  /* a spiral staircase of planks turning around the cylinder */
  stairs: {
    dur: 9, ext: { r: 80, z: 105 },
    scene: (u) => {
      const spin = RZ(u * Math.PI * 2);
      const steps = [];
      for (let i = 0; i < 6; i++) {
        const th = i * 0.9;
        steps.push(piece(PLANK60, COLOR.blue,
          RZ(th + Math.PI / 2), T(34 * Math.cos(th), 34 * Math.sin(th), i * 15), spin));
      }
      return [piece(CYL, COLOR.red, T(0, 0, 0), spin), ...steps];
    },
  },

  /* a loaded wagon crossing the scene, fading at the edges */
  train: {
    dur: 5, ext: { r: 110, z: 80 },
    scene: (u) => {
      const x = -95 + 190 * u;
      const alpha = clamp01(Math.min(u / 0.15, (1 - u) / 0.15));
      const on = (mesh, color, dx) => ({
        ...piece(mesh, color, T(x + dx, 0, 15)), alpha,
      });
      return [
        { ...piece(PLANK75, COLOR.blue, T(x, 0, 0)), alpha },
        on(CUBE, COLOR.lightblue, -18),
        on(CYL, COLOR.red, 18),
      ];
    },
  },

  /* the whole set, breathing gently in a row */
  family: {
    dur: 5, ext: { r: 125, z: 75 },
    scene: (u) => {
      const a = u * Math.PI * 2;
      const at = (mesh, color, x, i) =>
        piece(mesh, color, T(x, 0, 6 + 5 * Math.sin(a + i * 1.1)));
      return [
        at(PLANK75, COLOR.blue, -85, 0),
        at(CUBE, COLOR.lightblue, -25, 1),
        at(CYL, COLOR.red, 10, 2),
        at(ORANGE, COLOR.orange, 50, 3),
        at(PLANK60, COLOR.blue, 100, 4),
      ];
    },
  },

  /* ---- and from here on it escalates ---- */

  /* a stadium wave rolling across a 5×5 field of cubes */
  wavefield: {
    dur: 5, ext: { r: 95, z: 55 },
    scene: (u) => {
      const out = [];
      for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
        const z = 10 + 9 * Math.sin(u * Math.PI * 2 - (i + j) * 0.55);
        out.push(piece(CUBE, (i + j) % 2 ? COLOR.lightblue : COLOR.blue,
          T((i - 2) * 34, (j - 2) * 34, z)));
      }
      return out;
    },
  },

  /* a pendulum wave: planks and pins ticking at stepped frequencies,
   * drifting out of phase and snapping back once per loop */
  pendulum: {
    dur: 12, ext: { r: 100, z: 70 },
    scene: (u) => {
      const out = [];
      for (let i = 0; i < 7; i++) {
        const a = 0.3 * Math.sin(u * Math.PI * 2 * (2 + i));
        const [mesh, color] = i % 2 ? [CYL, COLOR.red] : [UPRIGHT60, COLOR.blue];
        out.push(piece(mesh, color, RX(a), T((i - 3) * 26, 0, 0)));
      }
      return out;
    },
  },

  /* a ring of dominoes forever knocking each other down */
  dominoes: {
    dur: 6, ext: { r: 95, z: 65 },
    scene: (u) => {
      const N = 10, R = 62;
      return Array.from({ length: N }, (_, i) => {
        const th = (i / N) * Math.PI * 2;
        const p = ((u - i / N) % 1 + 1) % 1;
        let a = 0;
        if (p < 0.12) a = 1.05 * Math.pow(p / 0.12, 2);
        else if (p < 0.5) a = 1.05;
        else if (p < 0.7) a = 1.05 * (1 - easeInOut((p - 0.5) / 0.2));
        return piece(UPRIGHT60, COLOR.blue,
          T(-7.5, 0, 0), RY(a), T(7.5, 0, 0),
          RZ(th + Math.PI / 2), T(R * Math.cos(th), R * Math.sin(th), 0));
      });
    },
  },

  /* sun, planet, moon: nested orbits in whole-number time */
  orrery: {
    dur: 10, ext: { r: 130, z: 80 },
    scene: (u) => {
      const a = u * Math.PI * 2;
      const px = 55 * Math.cos(a), py = 55 * Math.sin(a);
      const m = a * 5;
      return [
        piece(CYL, COLOR.red),
        piece(ORANGE, COLOR.orange, RZ(a), T(px, py, 8)),
        piece(CUBE, COLOR.lightblue, RZ(m),
          T(px + 42 * Math.cos(m), py + 42 * Math.sin(m), 12)),
        piece(PLANK60, COLOR.blue, RZ(a * 2 + Math.PI / 2),
          T(100 * Math.cos(a * 2), 100 * Math.sin(a * 2), 8)),
      ];
    },
  },

  /* the impossible staircase: steps sink as they turn, so the cube
   * climbs forever and gets nowhere */
  escher: {
    dur: 8, ext: { r: 78, z: 150 },
    scene: (u) => {
      const g = u * 8; // eight steps per loop, seamless treadmill
      const out = [piece(CYL, COLOR.red), piece(CYL, COLOR.red, T(0, 0, 60))];
      for (let k = Math.floor(g) - 1; k < Math.floor(g) + 10; k++) {
        const d = k - g;
        const th = d * (Math.PI / 4);
        const z = 14 * d + 14;
        const alpha = clamp01((d + 1.4) / 1.2) * clamp01((8.6 - d) / 1.2);
        if (alpha <= 0.01 || z < 0) continue;
        out.push({
          ...piece(PLANK60, COLOR.blue, RZ(th + Math.PI / 2),
            T(40 * Math.cos(th), 40 * Math.sin(th), z)),
          alpha,
        });
      }
      const hop = 12 * Math.pow(Math.sin(Math.PI * (g % 1)), 2);
      out.push(piece(CUBE, COLOR.lightblue, T(0, 40, 57 + hop)));
      return out;
    },
  },

  /* twelve pieces caught in a rising vortex */
  tornado: {
    dur: 6, ext: { r: 118, z: 160 },
    scene: (u) => {
      const kinds = [
        [CUBE, COLOR.lightblue], [ORANGE, COLOR.orange],
        [PLANK60, COLOR.blue], [CYL, COLOR.red],
      ];
      const out = [];
      for (let i = 0; i < 12; i++) {
        const h = (u * 2 + i / 12) % 1;
        const th = Math.PI * 2 * (u * 3 + i * 0.618);
        const r = 18 + 60 * h;
        const [mesh, color] = kinds[i % 4];
        out.push({
          ...piece(mesh, color,
            RZ(Math.PI * 2 * (u * 4 + i / 3)),
            T(r * Math.cos(th), r * Math.sin(th), 6 + h * 125)),
          alpha: clamp01(Math.sin(Math.PI * h) * 1.8),
        });
      }
      return out;
    },
  },

  /* a juggling fountain: pieces arc across, then shuffle back in line */
  fountain: {
    dur: 5, ext: { r: 95, z: 130 },
    scene: (u) => {
      const kinds = [
        [CUBE, COLOR.lightblue], [ORANGE, COLOR.orange], [CYL, COLOR.red],
        [PLANK60, COLOR.blue], [CUBE, COLOR.lightblue], [ORANGE, COLOR.orange],
      ];
      return kinds.map(([mesh, color], i) => {
        const p = (u + i / 6) % 1;
        if (p < 0.65) {
          const s = p / 0.65;
          return piece(mesh, color, RY(Math.PI * 2 * s),
            T(-65 + 130 * s, 0, 2 + 420 * s * (1 - s)));
        }
        const s = (p - 0.65) / 0.35;
        return {
          ...piece(mesh, color, T(65 - 130 * s, 0, 2)),
          alpha: 0.35 + 0.65 * Math.max(clamp01(1 - s * 6), clamp01((s - 0.8) / 0.2)),
        };
      });
    },
  },

  /* five pins passing the impulse down the line, cradle-style */
  newton: {
    dur: 3, ext: { r: 100, z: 70 },
    scene: (u) => {
      const A = 0.5;
      const aL = u < 0.5 ? A * Math.sin(Math.PI * (u * 2)) : 0;
      const aR = u >= 0.5 ? A * Math.sin(Math.PI * ((u - 0.5) * 2)) : 0;
      const out = [];
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * 31;
        if (i === 0 && aL > 0) {
          out.push(piece(CYL, COLOR.red, T(15, 0, 0), RY(-aL), T(x - 15, 0, 0)));
        } else if (i === 4 && aR > 0) {
          out.push(piece(CYL, COLOR.red, T(-15, 0, 0), RY(aR), T(x + 15, 0, 0)));
        } else {
          out.push(piece(CYL, COLOR.red, T(x, 0, 0)));
        }
      }
      return out;
    },
  },

  /* a ring of cubes inching forward one hop at a time */
  caterpillar: {
    dur: 6, ext: { r: 78, z: 50 },
    scene: (u) => {
      const N = 8, R = 55;
      return Array.from({ length: N }, (_, i) => {
        // each cube hops forward once per loop; the last hop lands
        // just before the seam, so u=1 matches u=0 rotated one slot
        const step = clamp01((u - i / N) / 0.12);
        const th = (Math.PI * 2 / N) * (i + easeInOut(step));
        const hop = 14 * Math.sin(Math.PI * step);
        return piece(CUBE, i % 2 ? COLOR.lightblue : COLOR.blue,
          RZ(th), T(R * Math.cos(th), R * Math.sin(th), hop));
      });
    },
  },

  /* the whole set marching around the ring, bobbing in step */
  parade: {
    dur: 8, ext: { r: 115, z: 45 },
    scene: (u) => {
      const kinds = [
        [PLANK75, COLOR.blue], [CUBE, COLOR.lightblue], [CYL, COLOR.red],
        [ORANGE, COLOR.orange], [PLANK60, COLOR.blue],
      ];
      return kinds.map(([mesh, color], i) => {
        const th = Math.PI * 2 * (u + i / 5);
        const hop = 6 * Math.abs(Math.sin(Math.PI * (u * 10 + i)));
        return piece(mesh, color, RZ(th + Math.PI / 2),
          T(75 * Math.cos(th), 75 * Math.sin(th), hop));
      });
    },
  },

  /* two planks crossed on a cylinder mast, turning in the wind */
  windmill: {
    dur: 6, ext: { r: 62, z: 170 },
    scene: (u) => {
      const a = u * Math.PI * 2;
      const blade = (k) => piece(PLANK75, COLOR.blue,
        T(0, 0, -7.5), RY(a + k * Math.PI / 2), T(0, -25, 125));
      return [
        piece(CYL, COLOR.red),
        piece(CYL, COLOR.red, T(0, 0, 60)),
        piece(CUBE, COLOR.lightblue, T(0, -25, 110)),
        blade(0), blade(1),
      ];
    },
  },

  /* three spiral arms of cubes turning around a red core */
  galaxy: {
    dur: 10, ext: { r: 110, z: 55 },
    scene: (u) => {
      const out = [piece(CYL, COLOR.red)];
      for (let k = 0; k < 3; k++) for (let i = 0; i < 5; i++) {
        const th = Math.PI * 2 * u + k * (Math.PI * 2 / 3) + i * 0.45;
        const r = 22 + i * 17;
        out.push(piece(CUBE, i % 2 ? COLOR.lightblue : COLOR.blue, RZ(th),
          T(r * Math.cos(th), r * Math.sin(th), 4 + 4 * Math.sin(Math.PI * 4 * u + i))));
      }
      return out;
    },
  },

  /* the full stack swaying through a tremor and holding on */
  quake: {
    dur: 5, ext: { r: 65, z: 155 },
    scene: (u) => {
      const amp = 0.13 * Math.pow(Math.sin(Math.PI * u), 2);
      const stack = [
        [PLANK75, COLOR.blue, 0], [ORANGE, COLOR.orange, 15],
        [CUBE, COLOR.lightblue, 39], [PLANK60, COLOR.blue, 69],
        [CYL, COLOR.red, 84],
      ];
      return stack.map(([mesh, color, z], k) =>
        piece(mesh, color, T(0, 0, z),
          RY(amp * Math.sin(Math.PI * 2 * 3 * u - k * 0.5))));
    },
  },

  /* a flock of blocks on tangled whole-number orbits */
  swarm: {
    dur: 12, ext: { r: 95, z: 135 },
    scene: (u) => {
      const out = [];
      for (let i = 0; i < 12; i++) {
        const f = (k) => 1 + ((i * 7 + k * 5) % 3); // frequencies 1–3
        const ph = (k) => (i * 0.37 + k * 0.61) % 1;
        const x = 70 * Math.sin(Math.PI * 2 * (f(0) * u + ph(0)));
        const y = 70 * Math.sin(Math.PI * 2 * (f(1) * u + ph(1)));
        const z = 55 + 42 * Math.sin(Math.PI * 2 * (f(2) * u + ph(2)));
        const [mesh, color] = i % 4 === 3
          ? [ORANGE, COLOR.orange] : [CUBE, COLOR.lightblue];
        out.push(piece(mesh, color,
          RZ(Math.PI * 2 * (u * f(0) + i / 5)), T(x, y, z)));
      }
      return out;
    },
  },

  /* a little house assembling itself: walls, door, lintel, roof */
  hus: {
    dur: 7, ext: { r: 55, z: 175 },
    scene: (u) => {
      const tau = u < 0.5 ? u * 2 : (1 - u) * 2; // palindrome
      const drop = (mk, slot) => {
        const p = easeOut(window01(tau, slot * 0.13, 0.2));
        return mk(175 * (1 - p));
      };
      return [
        drop((dz) => piece(UPRIGHT60, COLOR.blue, T(-22, 0, dz)), 0),
        drop((dz) => piece(UPRIGHT60, COLOR.blue, T(22, 0, dz)), 1),
        drop((dz) => piece(CUBE, COLOR.lightblue, T(0, 0, dz)), 2),
        drop((dz) => piece(PLANK75, COLOR.blue, T(0, 0, 60 + dz)), 3),
        drop((dz) => piece(ORANGE, COLOR.orange, RY(Math.PI / 4), T(0, 0, 91 + dz)), 4),
      ];
    },
  },

  /* a bricklayer's wall going up in running bond, then coming down */
  mur: {
    dur: 8, ext: { r: 80, z: 170 },
    scene: (u) => {
      const tau = u < 0.5 ? u * 2 : (1 - u) * 2;
      const lay = (mesh, color, x, z, slot) => {
        const p = easeOut(window01(tau, slot * 0.11, 0.18));
        return piece(mesh, color, T(x, 0, z + (165 - z) * (1 - p)));
      };
      return [
        lay(PLANK75, COLOR.blue, -30, 0, 0),
        lay(PLANK60, COLOR.blue, 40, 0, 1),
        lay(PLANK60, COLOR.blue, -38, 15, 2),
        lay(PLANK75, COLOR.blue, 30, 15, 3),
        lay(ORANGE, COLOR.orange, -15, 30, 4),
        lay(CUBE, COLOR.lightblue, 35, 30, 5),
      ];
    },
  },

  /* a wall clock: the minute hand laps the hour hand twelve to one */
  klokke: {
    dur: 24, ext: { r: 55, z: 150 },
    scene: (u) => {
      const hand = (mesh, pivot, y, revs) =>
        piece(mesh, COLOR.blue, T(pivot, 0, -7.5),
          RY(Math.PI * 2 * revs * u), T(0, y, 90));
      return [
        piece(CYL, COLOR.red, RX(Math.PI / 2), T(0, 30, 90)), // face-on pin
        hand(PLANK60, 22, -20, 1),   // hour
        hand(PLANK75, 30, -38, 12),  // minute
      ];
    },
  },

  /* a ferris wheel: crossed spokes, gondolas hanging level */
  ferris: {
    dur: 10, ext: { r: 58, z: 150 },
    scene: (u) => {
      const a = u * Math.PI * 2;
      const out = [
        piece(CYL, COLOR.red, T(0, 18, 0)),
        piece(CYL, COLOR.red, T(0, 18, 60)),
        piece(CUBE, COLOR.lightblue, T(0, 0, 90)),
        piece(PLANK75, COLOR.blue, T(0, 0, -7.5), RY(a), T(0, 0, 105)),
        piece(PLANK75, COLOR.blue, T(0, 0, -7.5), RY(a + Math.PI / 2), T(0, 0, 105)),
      ];
      for (let k = 0; k < 4; k++) {
        const phi = a + k * (Math.PI / 2);
        out.push(piece(CUBE, k % 2 ? COLOR.orange : COLOR.lightblue,
          T(37.5 * Math.cos(phi), 0, 105 - 37.5 * Math.sin(phi) - 34)));
      }
      return out;
    },
  },

  /* a three-cube cascade, thrown and caught forever */
  sjonglering: {
    dur: 3.6, ext: { r: 55, z: 135 },
    scene: (u) => {
      const path = (t) => {
        if (t < 0.38) { const s = t / 0.38; return [-38 + 76 * s, 22 + 380 * s * (1 - s)]; }
        if (t < 0.5) { const s = (t - 0.38) / 0.12; return [38 - 6 * Math.sin(Math.PI * s), 22 - 6 * Math.sin(Math.PI * s)]; }
        if (t < 0.88) { const s = (t - 0.5) / 0.38; return [38 - 76 * s, 22 + 380 * s * (1 - s)]; }
        const s = (t - 0.88) / 0.12;
        return [-38 + 6 * Math.sin(Math.PI * s), 22 - 6 * Math.sin(Math.PI * s)];
      };
      const colors = [COLOR.lightblue, COLOR.orange, COLOR.lightblue];
      return colors.map((c, i) => {
        const t = (u + i / 3) % 1;
        const [x, z] = path(t);
        return piece(i === 1 ? ORANGE : CUBE, c, RY(Math.PI * 2 * 2 * t), T(x, 0, z - (i === 1 ? 12 : 15)));
      });
    },
  },

  /* a waterfall of cubes, splashing at the foot */
  fossefall: {
    dur: 4, ext: { r: 65, z: 160 },
    scene: (u) => {
      const out = [];
      for (let c = 0; c < 3; c++) for (let j = 0; j < 3; j++) {
        const p = (u * 2 + j / 3 + c * 0.17) % 1;
        const alpha = Math.min(p / 0.12, (1 - p) / 0.12, 1);
        out.push({
          ...piece(CUBE, COLOR.lightblue, T((c - 1) * 32, 0, 145 * (1 - p))),
          alpha: clamp01(alpha),
        });
      }
      for (const s of [-1, 1]) {
        const hop = 10 * Math.abs(Math.sin(Math.PI * (u * 6 + (s + 1) / 2)));
        out.push(piece(CUBE, COLOR.lightblue, T(s * 48, 0, hop)));
      }
      return out;
    },
  },

  /* the rolling square: a cube tumbling edge over edge down the planks */
  tumle: {
    dur: 4, ext: { r: 85, z: 75 },
    scene: (u) => {
      const t = u * 4, k = Math.floor(Math.min(t, 3.999)), s = t - k;
      const th = (Math.PI / 2) * easeInOut(Math.min(1, s / 0.8));
      const alpha = clamp01(Math.min(u / 0.1, (1 - u) / 0.1) * 1.5);
      return [
        piece(PLANK75, COLOR.blue, T(-37.5, 0, 0)),
        piece(PLANK75, COLOR.blue, T(37.5, 0, 0)),
        { ...piece(CUBE, COLOR.lightblue,
          T(-15, 0, 0), RY(th), T(-45 + 30 * k, 0, 15)), alpha },
      ];
    },
  },

  /* the row doing the wave: a hop with a lean, passed down the line */
  takt: {
    dur: 4, ext: { r: 125, z: 60 },
    scene: (u) => {
      const kinds = [
        [PLANK75, COLOR.blue, -85], [CUBE, COLOR.lightblue, -25],
        [CYL, COLOR.red, 10], [ORANGE, COLOR.orange, 50], [PLANK60, COLOR.blue, 100],
      ];
      return kinds.map(([mesh, color, x], i) => {
        const p = (u * 2 - i * 0.15 % 1 + 1) % 1;
        const lift = Math.pow(Math.max(0, Math.sin(Math.PI * 2 * p)), 2);
        return piece(mesh, color, RY(0.1 * Math.sin(Math.PI * 2 * p)),
          T(x, 0, 12 * lift));
      });
    },
  },

  /* rola bola: the plank balancing on the rolling cylinder, cube riding */
  balanse: {
    dur: 5, ext: { r: 62, z: 80 },
    scene: (u) => {
      const x = 20 * Math.sin(u * Math.PI * 2);
      const a = 0.3 * Math.sin(u * Math.PI * 2);
      return [
        piece(CYL, COLOR.red, RX(Math.PI / 2), T(x, 30, 15)),
        piece(PLANK75, COLOR.blue, RY(a), T(-x * 0.5, 0, 30)),
        piece(CUBE, COLOR.lightblue, T(24, 0, 15), RY(a), T(-x * 0.5, 0, 30)),
      ];
    },
  },

  /* a rocket goes up; six sparks come down */
  fyrverkeri: {
    dur: 5, ext: { r: 95, z: 205 },
    scene: (u) => {
      const out = [piece(ORANGE, COLOR.orange)]; // the mortar
      const p1 = clamp01(u / 0.32);
      const rocketAlpha = u < 0.32
        ? clamp01(u / 0.04)
        : clamp01(1 - (u - 0.32) / 0.06);
      if (rocketAlpha > 0.01) {
        out.push({
          ...piece(CYL, COLOR.red, T(0, 0, 24 + 130 * easeOut(p1))),
          alpha: rocketAlpha,
        });
      }
      if (u > 0.32) {
        const tb = clamp01((u - 0.32) / 0.45);
        const e = easeOut(tb);
        for (let k = 0; k < 6; k++) {
          const phi = (k / 6) * Math.PI * 2;
          const alpha = clamp01((1 - tb) * 1.2) * (tb < 1 ? 1 : 0);
          if (alpha <= 0.01) continue;
          out.push({
            ...piece(CUBE, k % 2 ? COLOR.lightblue : COLOR.orange,
              RZ(tb * Math.PI * 2),
              T(Math.cos(phi) * 80 * e, 0,
                184 + Math.sin(phi) * 60 * e - 95 * tb * tb)),
            alpha,
          });
        }
      }
      return out;
    },
  },

  /* the tower detonates, scatters, and un-explodes back together */
  bigbang: {
    dur: 8, ext: { r: 110, z: 180 },
    scene: (u) => {
      const m = u > 0.5 ? 1 - u : u;                // palindrome
      const q = easeInOut(window01(m, 0.08, 0.34)); // 0 tower → 1 scattered
      const fly = (mesh, color, home, scatter, spins) => {
        const p = home.map((v, k) => v + (scatter[k] - v) * q);
        return piece(mesh, color, RZ(q * Math.PI * 2 * spins),
          T(p[0], p[1], p[2] + 70 * Math.sin(Math.PI * q)));
      };
      return [
        fly(PLANK75, COLOR.blue, [0, 0, 0], [-72, 28, 0], 1),
        fly(CUBE, COLOR.lightblue, [0, 0, 15], [58, -30, 0], 2),
        fly(ORANGE, COLOR.orange, [0, 0, 45], [34, 58, 0], 1),
        fly(CYL, COLOR.red, [0, 0, 69], [-42, -56, 0], 2),
      ];
    },
  },
};

/* ---- camera, light, colors ---- */

const K = Math.SQRT1_2;            // azimuth 45°
const SIN_E = 0.5, COS_E = Math.sqrt(3) / 2; // elevation 30°
const LIGHT = (() => {
  const l = [-0.5, 0.35, 1.15];    // high sun from the back-left
  const n = Math.hypot(...l);
  return l.map((v) => v / n);
})();
const AMB = [0.42, 0.44, 0.50];    // cool sky fill
const KEY = [0.62, 0.585, 0.52];   // warm sun

const project = ([x, y, z]) => [(x - y) * K, (x + y) * K * SIN_E - z * COS_E];
const nearness = ([x, y, z]) => (x + y) * K * COS_E + z * SIN_E;

function hexRgb(c) {
  c = c.trim().replace("#", "");
  if (c.length === 3) c = [...c].map((x) => x + x).join("");
  const n = parseInt(c, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* gamma-correct two-tone shading: cool sky ambient plus warm sun key */
function shade(base, n) {
  const lit = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
  return `rgb(${hexRgb(base).map((c, i) => {
    const v = Math.pow(c / 255, 2.2) * (AMB[i] + KEY[i] * lit);
    return Math.round(255 * Math.pow(Math.min(1, v), 1 / 2.2));
  }).join(",")})`;
}

/* ---- renderer ---- */

export function bounds(ext, scale) {
  const pts = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const z of [0, ext.z]) {
    pts.push(project([sx * ext.r, sy * ext.r, z]));
  }
  // room for the hard shadows cast toward +x / -y
  pts.push(project([
    ext.r - ext.z * (LIGHT[0] / LIGHT[2]),
    -ext.r - ext.z * (LIGHT[1] / LIGHT[2]),
    0,
  ]));
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

  // hard sun shadows: project the geometry to the ground along the light
  ctx.fillStyle = inkShadow;
  for (const p of solid) {
    const path = new Path2D();
    for (const f of p.faces) {
      const pts = f.map((v) => {
        const t = v[2] / LIGHT[2];
        return px(project([v[0] - LIGHT[0] * t, v[1] - LIGHT[1] * t, 0]));
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
    ctx.globalAlpha = 0.2 * (p.alpha ?? 1);
    ctx.fill(path);
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

  // ground shadow bars, nudged sunward and fading with altitude
  ctx.fillStyle = inkShadow;
  for (const p of solid) {
    ctx.globalAlpha = 0.18 * (p.alpha ?? 1) * clamp01(1 - p.minZ / 140);
    const [x0] = px([p.minX, 0, 0]);
    const [x1] = px([p.maxX, 0, 0]);
    const off = p.minZ * 0.12 * scale;
    ctx.fillRect(x0 + off, b.oy + 1, x1 - x0, 3);
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
