# block loops

Tiny looping animations for [iverfinne.no](https://iverfinne.no),
in three materials:

- **`toys.js`** — the klossete wooden set (see `models/BLOCKS.md`)
  animated as real isometric geometry: `<block-toys name="carousel">`.
  Ten scenes: carousel, tower, seesaw, metronome, bounce, roll, flip,
  stairs, train, family. No dependencies, no WebGL — a tiny canvas
  renderer with painter-sorted faces, shading, and soft shadows.
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
