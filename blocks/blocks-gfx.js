/*
 * blocks-gfx.js — the same loops as blocks.js, materialized as geometry.
 *
 * Every loop in blocks.js is a grid of density cells. This module renders
 * those cells as real blocks on a canvas instead of glyphs:
 *
 *   2d — crisp squares on a grid; density becomes opacity, bar cells
 *        become partial fills, quadrant cells become corner squares.
 *   3d — isometric voxels; density becomes stack height, so `rain`
 *        turns into falling columns and `wave` into a bar-chart swell.
 *
 * Usage:
 *   <script type="module" src="/blocks-gfx.js"></script>
 *   <block-gfx name="sea" mode="3d"></block-gfx>
 *
 * Attributes:
 *   name    a loop from blocks.js (required)
 *   mode    "3d" (default) or "2d"
 *   scale   block size in px — cube half-width in 3d, cell size in 2d
 *   fps     override the loop's native frame rate
 *
 * Colors come from the CSS custom properties --accent and --ground on the
 * element (falling back to sensible defaults), so the blocks follow your
 * theme the same way the glyphs follow currentColor.
 */

import { LOOPS, frameOf, SHADE, BAR } from "./blocks.js";

const QUAD = "▘▝▗▖"; // corner order: back, right, front, left (clockwise)

/* One frame as numeric cells. Meaning depends on the loop's kind:
 * shade 0–4, bar 0–8 (eighths), quad 0|corner 1–4, half 0|1(▄)|2(▀). */
export function cellsOf(name, t) {
  const kind = LOOPS[name].kind;
  return frameOf(name, t).split("\n").map((row) => [...row].map((ch) => {
    if (ch === " ") return 0;
    if (kind === "bar") return BAR.indexOf(ch) + 1;
    if (kind === "quad") return QUAD.indexOf(ch) + 1;
    if (kind === "half") return ch === "▀" ? 2 : 1;
    return SHADE.indexOf(ch);
  }));
}

/* Cells → voxel list on an integer grid, plus its bounds. */
export function voxelize(cells, kind) {
  const rows = cells.length, cols = cells[0].length;
  const vox = [];
  let W = cols, D = rows, maxZ = 4;

  if (kind === "bar") {
    // collapse the glyph rows: total eighths per column → stack height 0–4
    D = 1;
    for (let x = 0; x < cols; x++) {
      let eighths = 0;
      for (let y = 0; y < rows; y++) eighths += cells[y][x];
      const h = Math.round(eighths / (rows * 2));
      for (let z = 0; z < h; z++) vox.push([x, 0, z]);
    }
  } else if (kind === "quad") {
    // each cell is a 2×2 patch; the value picks one corner
    W = cols * 2; D = rows * 2; maxZ = 1;
    const corner = [[0, 0], [1, 0], [1, 1], [0, 1]];
    cells.forEach((row, y) => row.forEach((v, x) => {
      if (v) vox.push([x * 2 + corner[v - 1][0], y * 2 + corner[v - 1][1], 0]);
    }));
  } else {
    // shade & half: value is the stack height
    maxZ = kind === "half" ? 2 : 4;
    cells.forEach((row, y) => row.forEach((v, x) => {
      for (let z = 0; z < v; z++) vox.push([x, y, z]);
    }));
  }
  return { vox, W, D, maxZ };
}

function parseHex(c) {
  c = c.trim().replace("#", "");
  if (c.length === 3) c = [...c].map((x) => x + x).join("");
  const n = parseInt(c, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) {
  const A = parseHex(a), B = parseHex(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",")})`;
}

function themeOf(el) {
  const cs = getComputedStyle(el);
  const accent = cs.getPropertyValue("--accent").trim() ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "#6fae9c" : "#3e7a6c");
  const ground = cs.getPropertyValue("--ground").trim() ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "#141715" : "#f2f3f1");
  return {
    accent, ground,
    top: mix(accent, "#ffffff", 0.22),
    left: accent,
    right: mix(accent, "#000000", 0.32),
  };
}

/* ---- 2d: squares on a grid ---- */

export function size2d(name, scale) {
  const cells = cellsOf(name, 0);
  return { w: cells[0].length * scale, h: cells.length * scale };
}

export function draw2d(ctx, name, t, scale, colors) {
  const kind = LOOPS[name].kind;
  const cells = cellsOf(name, t);
  const gap = Math.max(1, scale * 0.12);
  const inner = scale - 2 * gap;
  ctx.fillStyle = colors.accent;

  cells.forEach((row, y) => row.forEach((v, x) => {
    if (!v) return;
    const px = x * scale + gap, py = y * scale + gap;
    ctx.globalAlpha = 1;
    if (kind === "bar") {
      const h = inner * (v / 8);
      ctx.fillRect(px, py + inner - h, inner, h);
    } else if (kind === "quad") {
      const s = inner / 2;
      const [dx, dy] = [[0, 0], [s, 0], [s, s], [0, s]][v - 1];
      ctx.fillRect(px + dx, py + dy, s, s);
    } else if (kind === "half") {
      ctx.fillRect(px, v === 2 ? py : py + inner / 2, inner, inner / 2);
    } else {
      ctx.globalAlpha = v / 4;
      ctx.fillRect(px, py, inner, inner);
    }
  }));
  ctx.globalAlpha = 1;
}

/* ---- 3d: isometric voxels ---- */

export function size3d(name, scale) {
  const { W, D, maxZ } = voxelize(cellsOf(name, 0), LOOPS[name].kind);
  const pad = 2;
  return {
    w: (W + D) * scale + pad * 2,
    h: (W + D) * scale * 0.5 + maxZ * scale + pad * 2,
    W, D, maxZ, pad,
  };
}

export function draw3d(ctx, name, t, scale, colors) {
  const kind = LOOPS[name].kind;
  const { vox } = voxelize(cellsOf(name, t), kind);
  const { D, maxZ, pad } = size3d(name, scale);
  const s = scale, ch = scale;
  const ox = D * s + pad, oy = maxZ * ch + pad;
  const P = (x, y, z) => [ox + (x - y) * s, oy + (x + y) * s * 0.5 - z * ch];

  // painter's order: back to front, bottom to top
  vox.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]) || a[2] - b[2]);

  ctx.strokeStyle = colors.ground;
  ctx.lineWidth = 1;
  ctx.lineJoin = "round";
  const face = (pts, fill) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  };

  for (const [x, y, z] of vox) {
    face([P(x, y, z + 1), P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)], colors.top);
    face([P(x + 1, y, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x + 1, y, z + 1)], colors.right);
    face([P(x, y + 1, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)], colors.left);
  }
}

/* ---- custom element ---- */

if (typeof HTMLElement !== "undefined") {

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)");
const DARK = matchMedia("(prefers-color-scheme: dark)");

class BlockGfx extends HTMLElement {
  static observedAttributes = ["mode", "name", "scale"];
  #timer = null;
  #t = 0;
  #io = null;
  #visible = true;
  #canvas = null;
  #ctx = null;

  connectedCallback() {
    const name = this.getAttribute("name");
    if (!LOOPS[name]) return;
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
      DARK.addEventListener("change", () => this.#draw());
      new MutationObserver(() => this.#draw())
        .observe(document.documentElement, { attributeFilter: ["data-theme"] });
    }
    this.#layout();
    this.#draw();
    this.#sync();
  }

  disconnectedCallback() {
    this.#stop();
    this.#io && this.#io.disconnect();
  }

  attributeChangedCallback() {
    if (!this.#canvas) return;
    this.#layout();
    this.#draw();
  }

  get #mode() { return this.getAttribute("mode") === "2d" ? "2d" : "3d"; }
  get #scale() {
    const s = Number(this.getAttribute("scale"));
    return s > 0 ? s : this.#mode === "2d" ? 12 : 7;
  }

  #layout() {
    const name = this.getAttribute("name");
    const { w, h } = (this.#mode === "2d" ? size2d : size3d)(name, this.#scale);
    const dpr = window.devicePixelRatio || 1;
    this.#canvas.width = Math.ceil(w * dpr);
    this.#canvas.height = Math.ceil(h * dpr);
    this.#canvas.style.width = w + "px";
    this.#canvas.style.height = h + "px";
    this.#ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  #draw() {
    if (!this.#canvas) return;
    const name = this.getAttribute("name");
    const { width, height } = this.#canvas;
    this.#ctx.save();
    this.#ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.#ctx.clearRect(0, 0, width, height);
    this.#ctx.restore();
    (this.#mode === "2d" ? draw2d : draw3d)(
      this.#ctx, name, this.#t, this.#scale, themeOf(this),
    );
  }

  #sync() {
    const run = this.#visible && !REDUCED.matches;
    run ? this.#start() : this.#stop();
  }

  #start() {
    if (this.#timer) return;
    const loop = LOOPS[this.getAttribute("name")];
    const fps = Number(this.getAttribute("fps")) || loop.fps;
    this.#timer = setInterval(() => {
      this.#t = (this.#t + 1) % loop.period;
      this.#draw();
    }, 1000 / fps);
  }

  #stop() {
    clearInterval(this.#timer);
    this.#timer = null;
  }
}

if (!customElements.get("block-gfx")) {
  customElements.define("block-gfx", BlockGfx);
}

}
