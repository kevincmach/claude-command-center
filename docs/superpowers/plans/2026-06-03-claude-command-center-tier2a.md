# Claude Command Center — Tier 2a (Furnished Rooms with Real Sprites) Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan has an inspect-and-name asset step — inline execution fits best.

**Goal:** Replace the flat emoji office with real pixel art — furnished rooms cut from a provided furniture sheet, plus a provided character sprite standing in each room. Static placement only.

**Architecture:** A build-time Node slicer (`pngjs`) cuts the furniture sheet into individual prop PNGs by detecting opaque islands, and trims the character. The React/DOM UI renders these as pixelated images — props as room decor, the character sprite as each session's body. No game engine; no backend change.

**Tech Stack:** TypeScript · React + Vite · `pngjs` (dev-only slicer) · `node:test`.

---

## File Structure

```
scripts/slice-sprites.mjs            # NEW dev tool: slice furniture + trim character
src/web/
├── assets/
│   ├── source/{character,furniture,walk}.png   # NEW copied originals
│   ├── props/prop_NN.png + atlas.json          # NEW generated (committed)
│   ├── props/names.json                        # NEW prop_NN → semantic name
│   └── character.png                           # NEW trimmed character (generated)
├── vite-env.d.ts                    # NEW (vite client types for glob/png imports)
├── roomDecor.ts                     # NEW pure: RoomId → prop names (tested)
├── propImages.ts                    # NEW resolve semantic prop name → image url
├── components/Room.tsx              # MODIFY: render room decor
├── components/Character.tsx         # MODIFY: sprite body instead of emoji
└── office.css                       # MODIFY: pixelated images, scene layout
test/roomDecor.test.ts               # NEW
```

**Baseline:** on branch `tier2a`, `npm test` → 40 passing.

---

## Task 1: Dev dependency, source assets, vite types

**Files:**
- Modify: `package.json` (add `pngjs` devDep)
- Create: `src/web/assets/source/{character,furniture,walk}.png`
- Create: `src/web/vite-env.d.ts`

- [ ] **Step 1: Add the slicer dependency**

Run: `npm install -D pngjs`
Expected: `pngjs` appears under devDependencies.

- [ ] **Step 2: Copy the provided art into the repo**

```bash
mkdir -p src/web/assets/source
cp ~/Downloads/Gemini_Generated_Image_bus3zpbus3zpbus3.png src/web/assets/source/character.png
cp ~/Downloads/Gemini_Generated_Image_nr5ufanr5ufanr5u.png src/web/assets/source/walk.png
cp ~/Downloads/Gemini_Generated_Image_rs282grs282grs28.png src/web/assets/source/furniture.png
ls -la src/web/assets/source
```
Expected: three PNGs present.

- [ ] **Step 3: Add Vite client types** (so `import.meta.glob` and `*.png`/`*.json` imports type-check)

Create `src/web/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/web/assets/source src/web/vite-env.d.ts
git commit -m "chore(art): import source sprites + pngjs slicer dep"
```

---

## Task 2: The slicer script (slice furniture, trim character)

**Files:**
- Create: `scripts/slice-sprites.mjs`

- [ ] **Step 1: Write `scripts/slice-sprites.mjs`**

```js
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src/web/assets/source')
const OUT = path.join(ROOT, 'src/web/assets/props')
const ALPHA = 16       // a pixel counts as "solid" above this alpha
const MIN_AREA = 1500  // ignore specks smaller than this many pixels

const readPNG = (f) => PNG.sync.read(fs.readFileSync(f))
const alphaAt = (png, x, y) => png.data[(png.width * y + x) * 4 + 3]

// Find bounding boxes of connected opaque regions (8-connectivity, flood fill).
function components(png) {
  const { width, height } = png
  const seen = new Uint8Array(width * height)
  const boxes = []
  const stack = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (seen[idx] || alphaAt(png, x, y) <= ALPHA) continue
      let minx = x, miny = y, maxx = x, maxy = y, area = 0
      stack.length = 0; stack.push(idx); seen[idx] = 1
      while (stack.length) {
        const p = stack.pop()
        const px = p % width, py = (p - px) / width
        area++
        if (px < minx) minx = px; if (px > maxx) maxx = px
        if (py < miny) miny = py; if (py > maxy) maxy = py
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const nx = px + dx, ny = py + dy
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
            const ni = ny * width + nx
            if (seen[ni] || alphaAt(png, nx, ny) <= ALPHA) continue
            seen[ni] = 1; stack.push(ni)
          }
        }
      }
      if (area >= MIN_AREA) boxes.push({ x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1, area })
    }
  }
  return boxes
}

function crop(png, b) {
  const out = new PNG({ width: b.w, height: b.h })
  for (let yy = 0; yy < b.h; yy++) {
    for (let xx = 0; xx < b.w; xx++) {
      const si = ((b.y + yy) * png.width + (b.x + xx)) * 4
      const di = (yy * b.w + xx) * 4
      out.data[di] = png.data[si]
      out.data[di + 1] = png.data[si + 1]
      out.data[di + 2] = png.data[si + 2]
      out.data[di + 3] = png.data[si + 3]
    }
  }
  return out
}

fs.mkdirSync(OUT, { recursive: true })

// --- furniture: many props on one sheet ---
const fur = readPNG(path.join(SRC, 'furniture.png'))
const boxes = components(fur)
// row-major order: group into rows (~50px tolerance), then left-to-right
boxes.sort((a, b) => (Math.abs(a.y - b.y) > 50 ? a.y - b.y : a.x - b.x))
const atlas = {}
boxes.forEach((b, i) => {
  const name = 'prop_' + String(i).padStart(2, '0')
  fs.writeFileSync(path.join(OUT, name + '.png'), PNG.sync.write(crop(fur, b)))
  atlas[name] = { w: b.w, h: b.h, x: b.x, y: b.y }
})
fs.writeFileSync(path.join(OUT, 'atlas.json'), JSON.stringify(atlas, null, 2))
console.log(`furniture → ${boxes.length} props`)

// --- character: trim the single biggest island to a tight sprite ---
const ch = readPNG(path.join(SRC, 'character.png'))
const cbox = components(ch).sort((a, b) => b.area - a.area)[0]
fs.writeFileSync(path.join(ROOT, 'src/web/assets/character.png'), PNG.sync.write(crop(ch, cbox)))
console.log(`character → trimmed ${cbox.w}x${cbox.h}`)
```

- [ ] **Step 2: Run the slicer and inspect**

Run: `node scripts/slice-sprites.mjs`
Expected: prints `furniture → N props` (expect roughly 13–16) and `character → trimmed WxH` (a few hundred px). `src/web/assets/props/prop_00.png …` and `src/web/assets/character.png` now exist.

- [ ] **Step 3: Eyeball the crops**

Run: `open src/web/assets/props` (macOS) — or list sizes: `ls -la src/web/assets/props`.
Confirm each `prop_NN.png` is a single clean prop and the character is tightly trimmed. If props are merged/split, tune `MIN_AREA`/`ALPHA` in the script and re-run. Do not commit yet (commit happens after naming in Task 3).

---

## Task 3: Name the props

**Files:**
- Create: `src/web/assets/props/names.json`

- [ ] **Step 1: Build the index→name map by looking at the crops**

Inspect each `prop_NN.png` and write `src/web/assets/props/names.json` mapping every
index to a semantic name drawn from this vocabulary (one per prop; reuse `plant`
for multiple plants by suffixing, e.g. `plant`, `plant2`):

```
desk, chair, plant, plant2, plant3, plant4, plant5,
bookshelf, water-cooler, sofa, sofa2, ping-pong, coffee-machine, rug
```

Example shape (your exact indices will vary — fill from what you see):
```json
{
  "prop_00": "desk",
  "prop_01": "chair",
  "prop_02": "plant",
  "prop_03": "bookshelf",
  "prop_04": "water-cooler",
  "prop_05": "sofa",
  "prop_06": "sofa2",
  "prop_07": "ping-pong",
  "prop_08": "coffee-machine",
  "prop_09": "rug",
  "prop_10": "plant2",
  "prop_11": "plant3",
  "prop_12": "plant4",
  "prop_13": "plant5"
}
```

- [ ] **Step 2: Commit the generated + named assets**

```bash
git add src/web/assets/props src/web/assets/character.png scripts/slice-sprites.mjs
git commit -m "feat(art): slice furniture into named props + trim character"
```

---

## Task 4: roomDecor mapping (pure, tested)

**Files:**
- Create: `src/web/roomDecor.ts`
- Test: `test/roomDecor.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ROOM_DECOR } from '../src/web/roomDecor.js'
import { ROOMS } from '../src/web/rooms.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const names = JSON.parse(
  fs.readFileSync(
    path.join(here, '../src/web/assets/props/names.json'),
    'utf8',
  ),
)
const known = new Set(Object.values(names))

test('every room has decor', () => {
  for (const r of ROOMS) assert.ok(ROOM_DECOR[r.id], r.id)
})

test('every decor prop exists in names.json', () => {
  for (const props of Object.values(ROOM_DECOR)) {
    for (const p of props) assert.ok(known.has(p), p)
  }
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `node --import tsx --test test/roomDecor.test.ts`
Expected: FAIL — cannot find `../src/web/roomDecor.js`.

- [ ] **Step 3: Implement `src/web/roomDecor.ts`** (use only prop names you actually put in `names.json`)

```ts
import type { RoomId } from './rooms.js'

export const ROOM_DECOR: Record<RoomId, string[]> = {
  work: ['desk', 'chair'],
  gym: ['water-cooler', 'plant'],
  break: ['ping-pong', 'sofa'],
  meeting: ['chair', 'plant2'],
  library: ['bookshelf', 'plant3'],
  lounge: ['sofa2', 'coffee-machine'],
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `node --import tsx --test test/roomDecor.test.ts`
Expected: 2 passing. (If a name fails, fix it to match `names.json`.)

- [ ] **Step 5: Commit**

```bash
git add src/web/roomDecor.ts test/roomDecor.test.ts
git commit -m "feat(web): room decor map (RoomId -> props)"
```

---

## Task 5: Prop image resolver + character sprite

**Files:**
- Create: `src/web/propImages.ts`
- Modify: `src/web/components/Character.tsx`
- Modify: `src/web/office.css`

- [ ] **Step 1: Create `src/web/propImages.ts`**

```ts
// Resolve a semantic prop name (e.g. "desk") to its built image URL.
import names from './assets/props/names.json'

const files = import.meta.glob('./assets/props/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

export const PROP_URL: Record<string, string> = {}
for (const [filePath, url] of Object.entries(files)) {
  const base = filePath.split('/').pop()!.replace('.png', '') // "prop_00"
  const semantic = (names as Record<string, string>)[base]
  if (semantic) PROP_URL[semantic] = url
}
```

- [ ] **Step 2: Swap the emoji body for the sprite in `Character.tsx`**

Add the import at the top:
```tsx
import characterSprite from '../assets/character.png'
```
Replace the body line:
```tsx
      <span className="body">{idle ? '😴' : '🤖'}</span>
```
with:
```tsx
      <img className="char-sprite" src={characterSprite} alt="" draggable={false} />
```

- [ ] **Step 3: Add sprite styles to `office.css`** (replace the `.body` rule)

Replace:
```css
.body { font-size: 24px; line-height: 1; }
```
with:
```css
.char-sprite {
  image-rendering: pixelated;
  height: 52px;
  width: auto;
  display: block;
}
.char--idle .char-sprite { filter: grayscale(0.4) brightness(0.8); }
```

- [ ] **Step 4: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean; the character sprite is bundled.

- [ ] **Step 5: Commit**

```bash
git add src/web/propImages.ts src/web/components/Character.tsx src/web/office.css
git commit -m "feat(web): real character sprite + prop image resolver"
```

---

## Task 6: Furnish the rooms

**Files:**
- Modify: `src/web/components/Room.tsx`
- Modify: `src/web/office.css`

- [ ] **Step 1: Render decor in `Room.tsx`**

Add imports:
```tsx
import { ROOM_DECOR } from '../roomDecor.js'
import { PROP_URL } from '../propImages.js'
```
Inside the `<section>`, immediately after the `<header>…</header>`, add a decor layer:
```tsx
      <div className="room-decor">
        {(ROOM_DECOR[room.id] ?? [])
          .map((name) => PROP_URL[name])
          .filter(Boolean)
          .map((url, i) => (
            <img key={i} className="prop" src={url} alt="" draggable={false} />
          ))}
      </div>
```

- [ ] **Step 2: Add scene styles to `office.css`** (append at the end)

```css
.room { min-height: 150px; }
.room-decor {
  position: absolute;
  bottom: 8px;
  left: 8px;
  right: 8px;
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  gap: 6px;
  opacity: 0.92;
  pointer-events: none;
  z-index: 0;
}
.prop {
  image-rendering: pixelated;
  height: 46px;
  width: auto;
}
.crew { position: relative; z-index: 1; }
```

- [ ] **Step 3: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/web/components/Room.tsx src/web/office.css
git commit -m "feat(web): furnish rooms with sliced props"
```

---

## Task 7: Full verify + run

**Files:** none (verification)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all passing (40 + roomDecor's 2 = 42).

- [ ] **Step 2: Run against the fixture**

Run: `node dist/server/index.js --claude-home test/fixtures/claude-home --port 4324 --vault /tmp/ccc-t2-vault`
Open `http://localhost:4324`. Expect: furnished rooms (desk/chair/bookshelf/etc.) with the real character sprite standing in them; "Other" still glowing in the Break Room. Ctrl-C to stop.

- [ ] **Step 3: Run against real `~/.claude` on the LAN**

Run: `node dist/server/index.js --lan --port 4317 --vault /tmp/ClaudeVault-live`
Open on phone/desktop. Confirm the furnished cozy office with sprites.

- [ ] **Step 4: Final commit (any visual tweaks)**

```bash
git add -A
git commit -m "chore: Tier 2a visual tweaks" --allow-empty
```

---

## Self-Review (completed)

- **Spec coverage:** asset import ✓ (T1), auto-slicer ✓ (T2), prop naming ✓ (T3),
  roomDecor map ✓ (T4, tested), character sprite ✓ (T5), furnished rooms ✓ (T6),
  identity stays ring+name (unchanged), fallbacks (missing asset → `.filter(Boolean)`;
  unknown name skipped) ✓, visual verify ✓ (T7). Walk sheet copied but unused ✓.
- **Placeholder scan:** the only fill-in-during-execution artifact is `names.json`
  (Task 3) — that is data produced by inspecting real crops, not a code placeholder;
  every code block is complete. `roomDecor.ts` names must match the `names.json`
  you author (Task 4 Step 4 verifies this).
- **Type consistency:** `RoomId`/`ROOMS` reused from Tier 1; `ROOM_DECOR`,
  `PROP_URL`, `characterSprite` consistent across T4–T6; `Room`/`Character` props
  unchanged. No backend/`Session` changes.
- **Deferred (per spec):** walking, clean walk sheet, per-project/model variants,
  perspective match, sound.
```
