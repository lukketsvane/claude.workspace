# Wooden Blocks — Facts

The five block GLBs, copied from `klossete.iverfinne.no/public/` (web-optimized set;
4K-texture originals live in that repo under `_glb_originals_4k/`).
Specs and colors match `lib/blocks.ts` in the klossete repo.

| Block | GLB | Dimensions | Color (hex) |
|---|---|---|---|
| Dark Blue Plank (base) | `block_blue_02.glb` | 30 × 75 × 15 mm | `#2f63cc` |
| Light Blue Cube | `block_lightblue_cube.glb` | 30 × 30 × 30 mm | `#3f9ec9` |
| Dark Blue Short | `block_blue_01.glb` | 30 × 60 × 15 mm | `#2f63cc` |
| Red Cylinder | `block_red_cylinder.glb` | Ø 30 mm · H 60 mm | `#c83a2e` |
| Orange Block | `block_orange.glb` | 45 × 45 × 24 mm | `#e07b22` |

## Color values

- Dark blue (plank + short): `#2f63cc` — rgb(47, 99, 204)
- Light blue (cube): `#3f9ec9` — rgb(63, 158, 201)
- Red (cylinder): `#c83a2e` — rgb(200, 58, 46)
- Orange (block): `#e07b22` — rgb(224, 123, 34)

## Notes

- The orange block rests with the 24 mm dimension as its height (45 × 45 footprint).
- The two planks lie flat: 15 mm high, 30 mm wide, 75 / 60 mm long.
- In the klossete engine, meshes were authored at `MESH_DESIGN_S = 0.045` scene
  units per mm and are rescaled at runtime (`S = 0.036`, `MESH_FIT = S / MESH_DESIGN_S`).
