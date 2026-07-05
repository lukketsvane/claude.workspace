/*
 * blocks.js — tiny looping animations drawn with Unicode block glyphs.
 *
 * Zero dependencies. Every loop is deterministic and closes perfectly
 * (frame(t) has an integer period), so there is never a visible seam.
 *
 * Usage:
 *   <script type="module" src="/blocks.js"></script>
 *   <block-loop name="wave"></block-loop>
 *
 * The glyphs render in `currentColor` and the element is display:inline-block,
 * so it can sit in running text, a header, a footer — anywhere.
 *
 * Attributes:
 *   name   one of the keys in LOOPS (required)
 *   fps    override the loop's native frame rate
 *   title  accessible label (defaults to the loop name)
 */

export const SHADE = " ░▒▓█";   // density ramp
export const BAR = "▁▂▃▄▅▆▇█"; // vertical eighths
const TAU = Math.PI * 2;

/* deterministic hash → [0,1), so "random" loops still close */
function hash(x, y, t) {
  let n = (x * 374761393 + y * 668265263 + t * 2246822519) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function grid(w, h, cell) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++) row += cell(x, y);
    rows.push(row);
  }
  return rows.join("\n");
}

/*
 * Each loop: { fps, period, frame(t) } with t in [0, period).
 */
export const LOOPS = {

  /* quadrant spinner, clockwise */
  spin: {
    fps: 8, period: 4, kind: "quad",
    frame: (t) => "▘▝▗▖"[t],
  },

  /* a ripple of density spreading from the centre */
  pulse: {
    fps: 10, period: 8, kind: "shade",
    frame: (t) => {
      const level = t < 4 ? t + 1 : 8 - t; // 1 2 3 4 3 2 1 0
      return grid(7, 1, (x) => SHADE[Math.max(0, level - Math.abs(x - 3))]);
    },
  },

  /* a sine wave travelling left */
  wave: {
    fps: 12, period: 24, kind: "bar",
    frame: (t) => grid(12, 1, (x) => {
      const s = Math.sin(x * 0.7 - (t / 24) * TAU);
      return BAR[Math.round((s + 1) / 2 * 7)];
    }),
  },


  /* a swell rolling diagonally across a field */
  sea: {
    fps: 12, period: 24, kind: "shade",
    frame: (t) => grid(8, 5, (x, y) => {
      const s = Math.sin(x * 0.8 + y * 0.55 - (t / 24) * TAU);
      return SHADE[Math.round((s + 1) / 2 * 4)];
    }),
  },

  /* a solid block sweeping back and forth over static */
  scan: {
    fps: 12, period: 18, kind: "shade",
    frame: (t) => {
      const pos = t < 10 ? t : 18 - t; // bounce 0..9..1
      return grid(10, 1, (x) => (x === pos ? "█" : "░"));
    },
  },

  /* staggered columns of falling density */
  rain: {
    fps: 10, period: 9, kind: "shade",
    frame: (t) => grid(8, 5, (x, y) => {
      const head = (t + Math.floor(hash(x, 0, 0) * 9)) % 9;
      const d = head - y;
      return d >= 0 && d < 4 ? "█▓▒░"[d] : " ";
    }),
  },

  /* dithered shimmer, like static on a quiet channel */
  noise: {
    fps: 6, period: 8, kind: "shade",
    frame: (t) => grid(8, 4, (x, y) => {
      const v = hash(x, y, t);
      return v < 0.55 ? " " : v < 0.75 ? "░" : v < 0.9 ? "▒" : "▓";
    }),
  },

  /* a snake of density running the perimeter of a frame */
  crawl: {
    fps: 12, period: 20, kind: "shade",
    frame: (t) => {
      const W = 8, H = 4, P = 2 * W + 2 * (H - 2); // 20 perimeter cells
      const index = (x, y) => {
        if (y === 0) return x;                     // top, left→right
        if (x === W - 1) return W - 1 + y;         // right, top→bottom
        if (y === H - 1) return W - 1 + H - 1 + (W - 1 - x); // bottom, right→left
        return P - y;                              // left, bottom→top
      };
      return grid(W, H, (x, y) => {
        const edge = y === 0 || y === H - 1 || x === 0 || x === W - 1;
        if (!edge) return " ";
        const d = (t - index(x, y) + P) % P;
        return d < 4 ? "█▓▒░"[d] : " ";
      });
    },
  },

  /* seven bars breathing out of phase */
  eq: {
    fps: 12, period: 24, kind: "bar",
    frame: (t) => {
      const H = 4;
      const level = (b) => {
        const f = 1 + (b % 2), phi = b * 0.9;
        return H * (0.5 + 0.5 * Math.sin((f * t / 24) * TAU + phi));
      };
      return grid(7, H, (x, y) => {
        const frac = Math.min(1, Math.max(0, level(x) - (H - 1 - y)));
        const eighths = Math.round(frac * 8);
        return eighths === 0 ? " " : BAR[eighths - 1];
      });
    },
  },

  /* half-block weave flipping parity */
  checker: {
    fps: 2, period: 2, kind: "half",
    frame: (t) => grid(8, 2, (x, y) => ((x + y + t) % 2 ? "▀" : "▄")),
  },
};

/* Render one frame without the custom element (SSR, canvas, wherever). */
export function frameOf(name, t) {
  const loop = LOOPS[name];
  return loop.frame(((t % loop.period) + loop.period) % loop.period);
}

/* Everything below is browser-only; frameOf/LOOPS work anywhere. */
if (typeof HTMLElement !== "undefined") {

const REDUCED = typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)");

class BlockLoop extends HTMLElement {
  #timer = null;
  #t = 0;
  #observer = null;
  #visible = true;

  connectedCallback() {
    const name = this.getAttribute("name");
    if (!LOOPS[name]) return;
    this.style.display = "inline-block";
    this.style.fontFamily = "inherit";
    this.style.whiteSpace = "pre";
    this.style.lineHeight = "1";
    this.style.letterSpacing = "0";
    this.style.verticalAlign = "middle";
    this.setAttribute("role", "img");
    this.setAttribute("aria-label", this.getAttribute("title") || name);
    this.textContent = frameOf(name, 0);

    this.#observer = new IntersectionObserver(([entry]) => {
      this.#visible = entry.isIntersecting;
      this.#sync();
    });
    this.#observer.observe(this);
    REDUCED && REDUCED.addEventListener("change", () => this.#sync());
    this.#sync();
  }

  disconnectedCallback() {
    this.#stop();
    this.#observer && this.#observer.disconnect();
  }

  #sync() {
    const run = this.#visible && !(REDUCED && REDUCED.matches);
    run ? this.#start() : this.#stop();
  }

  #start() {
    if (this.#timer) return;
    const name = this.getAttribute("name");
    const loop = LOOPS[name];
    const fps = Number(this.getAttribute("fps")) || loop.fps;
    this.#timer = setInterval(() => {
      this.#t = (this.#t + 1) % loop.period;
      this.textContent = loop.frame(this.#t);
    }, 1000 / fps);
  }

  #stop() {
    clearInterval(this.#timer);
    this.#timer = null;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("block-loop")) {
  customElements.define("block-loop", BlockLoop);
}

}
