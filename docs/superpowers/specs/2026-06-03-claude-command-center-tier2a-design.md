# Tier 2a (slice 1) — Furnished Rooms with Real Sprites — Design Spec

**Project:** Claude Command Center
**Status:** Approved direction (2026-06-03)
**Parent:** `2026-06-03-claude-command-center-roadmap.md` (Tier 2 · Polish & Delight)

## Goal

Replace the flat emoji office with **real pixel-art**: furnished rooms built from a
provided furniture sprite sheet, and a provided character sprite standing in each
room. Static placement only — a large visual upgrade with no animation risk.

## Provided assets (user-generated, owned, transparent PNG, 2816×1536 each)

- **character** — one cozy ¾-view office worker (idle pose).
- **furniture** — a sheet of separate props (desk+computer, chair, plants,
  bookshelf, water cooler, sofas, ping-pong table, coffee machine, rug).
- **walk sheet** — parked for the later walking step (not used in this slice).

## Scope

**In:** asset import, an auto-slicer that cuts the furniture sheet into named
props, furnished rooms, character sprites placed per session, identity via the
existing ring + name. Rendered as pixelated `<img>` in the existing React/DOM —
**no game engine**.

**Out (later detailed spec):** walking animation + clean walk sheet, per-project /
per-model outfit variants, perspective matching, sound, refined art prompts.

## Approach

1. **Asset import.** Copy the PNGs into `src/web/assets/source/`:
   `character.png`, `furniture.png`, `walk.png` (walk kept for later).

2. **Auto-slicer** (`scripts/slice-sprites.mjs`, build-time, Node + `pngjs`).
   Reads `furniture.png`, finds connected components of opaque pixels (alpha above
   a threshold) via flood fill, computes each island's bounding box, discards
   noise (area below a minimum), sorts boxes top-to-bottom then left-to-right, and
   crops each into `src/web/assets/props/<name>.png`. Emits
   `src/web/assets/props/atlas.json` (`name → { w, h }`). Names are assigned from
   the known sheet layout after inspecting detected boxes. **Outputs are committed**
   so end users never run the slicer.

3. **Room furnishing.** A `roomDecor.ts` map: each `RoomId` → the prop names that
   dress it (e.g. `work → [desk, chair]`, `library → [bookshelf, plant]`,
   `break → [ping-pong, sofa]`, `lounge → [sofa, coffee-machine]`,
   `gym → [water-cooler, plant]`, `meeting → [plant, chair]`). Props render as
   pixelated background decor inside the room.

4. **Character rendering.** The `character.png` sprite replaces the 🤖 emoji,
   rendered pixelated; idle/lounge characters dimmed as today. Ring + name + work
   line + meter stay. Tap still opens detail.

## Components (extends Tier 1, no backend change)

- `scripts/slice-sprites.mjs` — the one-time slicer (dev tool).
- `src/web/assets/props/*` + `atlas.json` — generated sprites (committed).
- `src/web/roomDecor.ts` *(pure, tested)* — `RoomId → propName[]`.
- `Room.tsx` — render the room's decor props behind the crew.
- `Character.tsx` — swap emoji body for the character sprite image.
- `office.css` — pixelated image rendering, room scene layout, prop placement.

## Error handling / edges

- **Missing assets:** components fall back to the emoji body / undecorated room if
  an image is absent, so the app never breaks if an asset is removed.
- **Slicer noise:** a minimum-area filter drops stray specks; a max-count guard
  logs if detection finds far more/fewer islands than expected (so we notice a bad
  slice instead of shipping it).
- **Unknown prop name in `roomDecor`:** skipped silently (no broken `<img>`).

## Testing

- **Unit (`node:test`):** `roomDecor.ts` — every `RoomId` has an entry; every
  referenced prop name exists in `atlas.json`.
- **Slicer verification:** run it, confirm the expected count of props with sane
  sizes, eyeball the cropped files.
- **Visual:** run against the fixture and real `~/.claude`; confirm furnished
  rooms + character sprites on desktop and phone.

## Open questions (deferred, not blocking)

- Per-room prop counts / arrangement polish (refine visually during build).
- Whether the character should face a direction (single idle pose is fine now).
