# Pegbox

Generative parametric porcelain forms — an installable, offline-capable PWA
3D viewer aimed at iOS (Add to Home Screen).

Every sculpture is a single **fin** arrayed radially around an axis,
optionally stacked in rings. The fin profile is grown from a seeded scalar
field — a vertical chain of star-modulated lobes plus a connecting spine,
minus punch-holes, cut flat at the floor — contoured with marching squares
and extruded with a bevel. Vertex colors fake the celadon glaze pooling
thin (white) on tips and edges. Five tuned families (spokes, lattice,
crown, kelp, wild) seed the space; every 32-bit seed is a different form.

## Interaction

- **Drag** — rotate the piece (turntable + tilt). No pan, no zoom.
- **⟳** — new random form (seed lands in the URL hash for sharing).
- **⚙** — minimal slider panel: fins, rows, stacks, height, spread,
  wave, edge, slant, thick, holes.

## Run

Any static server from this directory, e.g.

```sh
python3 -m http.server 8000
```

then open `http://localhost:8000/`. On iOS Safari use
Share → Add to Home Screen for the fullscreen standalone app;
the service worker makes it work offline after first load.

`vendor/` carries three.js (r170) so there are no network dependencies.
