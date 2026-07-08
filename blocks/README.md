# block loops

Tiny looping animations for [iverfinne.no](https://iverfinne.no),
in three materials:

- **`toys-gl.js`** — the klossete wooden set for real:
  `<block-toys-gl name="rull">` renders the actual textured GLB
  models (`models/`) in WebGL, lit by exactly two directional
  lights — a warm key and a cool fill, no ambient, no environment —
  with soft mapped shadows falling on the page itself
  (transparent canvas, shadow-catcher ground, vendored three.js).
- **`toys.js`** — the same fourteen scenes as a zero-dependency flat
  canvas renderer: `<block-toys name="rull">`, plus a 2d mode
  (`mode="2d"`) of face-on silhouettes. This file also owns the
  physics: fourteen scenes, held to strict rules — at most one instance
  of each of the five blocks, every motion integrated real dynamics
  (the one licensed exception is `stopp`, which plays by stop-motion
  film rules: held poses, each a stable structure), and exact
  contact geometry: pieces touch, they never interpenetrate.

  | scene     | what happens |
  | --------- | ------------ |
  | `rull`    | the cylinder rolls the valley between the two planks: a = ⅔·g·sinθ, no slip anywhere, an energy-conserving pivot around each ramp lip — and both ramps sit at exactly the same angle, because 30⁄75 = 24⁄60 |
  | `vugge`   | the short plank stands on end on the pedestal and rocks from bottom edge to bottom edge: the classic rocking-block equation, integrated, with an elastic edge swap through flat |
  | `kanon`   | all five blocks rock at amplitudes solved so their periods lock to 4 : 5 : 6 : 7 : 8 cycles per loop — in step at the downbeat, drifting into a wave, snapping back |
  | `flaske`  | spin the bottle: the cylinder in steady precession, rolling on its rim without slipping; the contact circle is chosen equal to its own radius so even the wood grain loops seamlessly |
  | `fontene` | three pieces in elastic ballistic bounce, periods locked 2 : 3 : 4 — the cylinder end over end, the cube somersaulting, the orange block helicoptering |
  | `kron`    | heads or tails: the cylinder flips half a turn per flight on the orange anvil, landing on the opposite face every time |
  | `piruett` | a cube's inertia tensor is isotropic and its balanced corner puts gravity through the contact point: steady spin on the tip of the red column is an exact solution |
  | `terning` | the die: 120° of constant spin about the body diagonal per flight — it tumbles corner over corner yet lands flat every time, because a third-turn about the diagonal is a symmetry of the cube |
  | `flipper` | the cube ping-pongs in the court: an elastic floor bounce at centre, then a wall kiss exactly at each apex — the standing plank left, the cylinder right; every impulse passes through the centre of mass, so it never spins |
  | `stopp`   | stop motion at 5 fps: the set rebuilds itself — tower, bridge, gate — one block moved per frame, hovering hand-held between placements |
  | `gange`   | stop motion again: the short plank tip-walks end over end, two steps out and two steps home |
  | `sisyfos` | two rule books in one: uphill the cube shoulders the cylinder up the ramp frame by held frame — downhill is real integrated rolling, ending in an inelastic wooden thud against the chock |
  | `skru`    | the Dzhanibekov flip: plank60 tumbles about its unstable intermediate axis, integrated from Euler's equations, with the launch spin solved by shooting so one ω-period lands it exactly flat |
  | `sprett`  | the orange block bounces on the cube: exact parabolic flight, one full torque-free somersault per bounce at constant spin, landing flat every time |
- **`blocks-gfx.js`** — the abstract density loops below rendered as
  flat pixels or voxel stacks: `<block-gfx name="sea" mode="3d">`.
- **`blocks.js`** — the same loops as Unicode block glyphs
  (`░ ▒ ▓ █ ▘ ▝ ▗ ▖ ▁▂▃▄▅▆▇`): `<block-loop name="wave">`.

`models/` holds the source GLB/USDZ assets and measured specs of the
physical set.

- **Zero dependencies** — one ES module, ~3 kB, no build step.
- **Perfect loops** — every animation is deterministic with an integer
  period, so it never shows a seam.
- **Inherits the page** — glyphs render in `currentColor` and the
  page's font size, so they follow your theme (light/dark) for free.
- **Polite** — pauses when scrolled offscreen, and freezes on the
  first frame for users with `prefers-reduced-motion`.

## Use

```html
<script type="module" src="/blocks.js"></script>

<block-loop name="wave"></block-loop>
```

Style it like text — color and font-size are the whole API:

```html
<block-loop name="rain" style="font-size: 10px; color: #6fae9c"></block-loop>
<block-loop name="spin" fps="4"></block-loop>
```

## The loops

| name      | looks like                              | grid  |
| --------- | --------------------------------------- | ----- |
| `spin`    | quadrant spinner, clockwise             | 1×1   |
| `pulse`   | density ripple from the centre          | 7×1   |
| `wave`    | sine wave travelling left               | 12×1  |
| `scan`    | solid block sweeping back and forth     | 10×1  |
| `rain`    | staggered falling columns               | 8×5   |
| `noise`   | dithered shimmer, quiet-channel static  | 8×4   |
| `crawl`   | a snake running a frame's perimeter     | 8×4   |
| `eq`      | seven bars breathing out of phase       | 7×4   |
| `checker` | half-block weave flipping parity        | 8×2   |

Open `index.html` for a live specimen sheet (serve the folder,
e.g. `npx serve blocks`, since it's an ES module).

## Without the custom element

`frameOf(name, t)` returns frame `t` as a plain string — useful for
server rendering a static first frame, or driving the glyphs some
other way:

```js
import { frameOf } from "./blocks.js";
frameOf("wave", 0); // "▄▆█▇▅▃▂▁▁▂▄▆"
```

## Adding a loop

A loop is `{ fps, period, frame(t) }` where `frame` returns the same
string shape for every `t` in `[0, period)`. Add one to `LOOPS` and it
appears on the specimen sheet automatically. Keep `period` an integer
and derive everything from `t` — that's what makes the loop close.

## Exports

`exports/` holds every loop pre-rendered as GIF and MP4
(`toys-3d/`, `toys-2d/`, `fields-3d/`), regenerated with the
Playwright + ffmpeg pipeline. Handy for embedding where you'd
rather drop a file than run the element.
