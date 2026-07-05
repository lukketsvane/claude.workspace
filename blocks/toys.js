/*
 * toys.js — looping animations built from the klossete wooden block set.
 *
 * The five physical pieces (see models/BLOCKS.md) rendered as real
 * geometry on a canvas: a tiny orthographic-isometric engine with
 * painter-sorted faces, directional shading, and soft ground shadows.
 * No dependencies, no WebGL.
 *
 * Usage:
 *   <script type="module" src="/toys.js"></script>
 *   <block-toys name="carousel"></block-toys>
 *
 * Attributes:
 *   name    a scene from TOYS (required)
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

function prism(r, h, n = 18) {
  const b = [], t = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    b.push([r * Math.cos(a), r * Math.sin(a), 0]);
    t.push([r * Math.cos(a), r * Math.sin(a), h]);
  }
  const faces = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push([b[i], b[j], t[j], t[i]]);
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
const T = (x, y, z) => ({ r: I3, t: [x, y, z] });
const S = (x, y, z) => ({ r: [[x, 0, 0], [0, y, 0], [0, 0, z]], t: [0, 0, 0] });
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
      const squash = 1 - 0.22 * clamp01(1 - (z - 15) / 14);
      const spread = 1 / Math.sqrt(squash);
      return [
        piece(PLANK75, COLOR.blue),
        piece(ORANGE, COLOR.orange, S(spread, spread, squash), T(0, 0, z)),
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
};

/* ---- camera, light, colors ---- */

const K = Math.SQRT1_2;            // azimuth 45°
const SIN_E = 0.5, COS_E = Math.sqrt(3) / 2; // elevation 30°
const LIGHT = (() => {
  const l = [-0.45, 0.3, 0.84];
  const n = Math.hypot(...l);
  return l.map((v) => v / n);
})();

const project = ([x, y, z]) => [(x - y) * K, (x + y) * K * SIN_E - z * COS_E];
const nearness = ([x, y, z]) => (x + y) * K * COS_E + z * SIN_E;

function hexRgb(c) {
  c = c.trim().replace("#", "");
  if (c.length === 3) c = [...c].map((x) => x + x).join("");
  const n = parseInt(c, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shadeColor(base, f) {
  // f in [-1,1]: toward white when lit, toward black in shadow
  const [r, g, b] = hexRgb(base);
  const t = f > 0 ? f * 0.3 : f * 0.42;
  const to = f > 0 ? 255 : 0;
  const mixc = (v) => Math.round(v + (to - v) * Math.abs(t));
  return `rgb(${mixc(r)},${mixc(g)},${mixc(b)})`;
}

/* ---- renderer ---- */

export function bounds(ext, scale) {
  const pts = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const z of [0, ext.z]) {
    pts.push(project([sx * ext.r, sy * ext.r, z]));
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

  // world-space faces per piece
  const solid = pieces.map((p) => {
    const faces = p.mesh.map((f) => f.map((v) => apply(p.xf, v)));
    const verts = faces.flat();
    let cx = 0, cy = 0, minZ = Infinity, near = 0;
    for (const v of verts) { cx += v[0]; cy += v[1]; minZ = Math.min(minZ, v[2]); near += nearness(v); }
    cx /= verts.length; cy /= verts.length;
    let rad = 0;
    for (const v of verts) rad = Math.max(rad, Math.hypot(v[0] - cx, v[1] - cy));
    return { ...p, faces, cx, cy, minZ, rad, near: near / verts.length };
  }).sort((a, b) => a.near - b.near);

  // soft shadows first
  for (const p of solid) {
    const a = (p.alpha ?? 1) * Math.max(0.03, 0.13 * (1 - p.minZ / 160));
    const [sx, sy] = px(project([p.cx, p.cy, 0]));
    ctx.beginPath();
    ctx.ellipse(sx, sy, p.rad * 0.82 * scale, p.rad * 0.82 * scale * SIN_E, 0, 0, Math.PI * 2);
    ctx.fillStyle = inkShadow;
    ctx.globalAlpha = a;
    ctx.fill();
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
      const lit = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
      const fill = shadeColor(p.color, lit);
      ctx.beginPath();
      f.forEach((v, i) => {
        const [x, y] = px(project(v));
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
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

/* ---- custom element ---- */

if (typeof HTMLElement !== "undefined") {

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)");

class BlockToys extends HTMLElement {
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

  get #scale() {
    const s = Number(this.getAttribute("scale"));
    return s > 0 ? s : 0.55;
  }

  #layout() {
    const { w, h } = bounds(TOYS[this.getAttribute("name")].ext, this.#scale);
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
    drawScene(this.#ctx, name, REDUCED.matches ? 0 : u, this.#scale, ink);
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
