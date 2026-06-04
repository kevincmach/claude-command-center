import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src/web/assets/source')
const OUT = path.join(ROOT, 'src/web/assets/props')
const MIN_AREA = 1500 // ignore specks
const TOL = 30 // background color match tolerance per channel

const readPNG = (f) => PNG.sync.read(fs.readFileSync(f))
const rgb = (png, x, y) => {
  const i = (png.width * y + x) * 4
  return [png.data[i], png.data[i + 1], png.data[i + 2]]
}
const grayish = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b) < 22

// The "transparent" checkerboard is baked-in gray pixels. Learn its colors from
// the image border (which is all background), then treat matching grays as empty.
function sampleBg(png) {
  const { width, height } = png
  const ring = 3
  const set = []
  const add = (r, g, b) => {
    if (!grayish(r, g, b)) return
    for (const c of set)
      if (Math.abs(c[0] - r) < TOL && Math.abs(c[1] - g) < TOL && Math.abs(c[2] - b) < TOL) return
    set.push([r, g, b])
  }
  for (let x = 0; x < width; x++)
    for (let y = 0; y < ring; y++) {
      add(...rgb(png, x, y))
      add(...rgb(png, x, height - 1 - y))
    }
  for (let y = 0; y < height; y++)
    for (let x = 0; x < ring; x++) {
      add(...rgb(png, x, y))
      add(...rgb(png, width - 1 - x, y))
    }
  return set
}
const isBg = (png, x, y, bg) => {
  const [r, g, b] = rgb(png, x, y)
  if (!grayish(r, g, b)) return false
  for (const c of bg)
    if (Math.abs(c[0] - r) < TOL && Math.abs(c[1] - g) < TOL && Math.abs(c[2] - b) < TOL) return true
  return false
}

function components(png, bg) {
  const { width, height } = png
  const seen = new Uint8Array(width * height)
  const boxes = []
  const stack = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (seen[idx] || isBg(png, x, y, bg)) continue
      let minx = x, miny = y, maxx = x, maxy = y, area = 0
      stack.length = 0; stack.push(idx); seen[idx] = 1
      while (stack.length) {
        const p = stack.pop()
        const px = p % width, py = (p - px) / width
        area++
        if (px < minx) minx = px; if (px > maxx) maxx = px
        if (py < miny) miny = py; if (py > maxy) maxy = py
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const nx = px + dx, ny = py + dy
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
            const ni = ny * width + nx
            if (seen[ni] || isBg(png, nx, ny, bg)) continue
            seen[ni] = 1; stack.push(ni)
          }
      }
      if (area >= MIN_AREA) boxes.push({ x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1, area })
    }
  }
  return boxes
}

// Crop a box and bake transparency: background pixels become alpha 0.
function crop(png, b, bg) {
  const out = new PNG({ width: b.w, height: b.h })
  for (let yy = 0; yy < b.h; yy++)
    for (let xx = 0; xx < b.w; xx++) {
      const sx = b.x + xx, sy = b.y + yy
      const di = (yy * b.w + xx) * 4
      if (isBg(png, sx, sy, bg)) {
        out.data[di + 3] = 0
        continue
      }
      const si = (sy * png.width + sx) * 4
      out.data[di] = png.data[si]
      out.data[di + 1] = png.data[si + 1]
      out.data[di + 2] = png.data[si + 2]
      out.data[di + 3] = 255
    }
  return out
}

fs.mkdirSync(OUT, { recursive: true })

// --- furniture ---
const fur = readPNG(path.join(SRC, 'furniture.png'))
const furBg = sampleBg(fur)
const boxes = components(fur, furBg)
boxes.sort((a, b) => (Math.abs(a.y - b.y) > 80 ? a.y - b.y : a.x - b.x))
const atlas = {}
boxes.forEach((b, i) => {
  const name = 'prop_' + String(i).padStart(2, '0')
  fs.writeFileSync(path.join(OUT, name + '.png'), PNG.sync.write(crop(fur, b, furBg)))
  atlas[name] = { w: b.w, h: b.h, x: b.x, y: b.y }
})
fs.writeFileSync(path.join(OUT, 'atlas.json'), JSON.stringify(atlas, null, 2))
console.log(`furniture bg colors: ${furBg.length}, props: ${boxes.length}`)
boxes.forEach((b, i) =>
  console.log(`  prop_${String(i).padStart(2, '0')}  ${b.w}x${b.h}  at (${b.x},${b.y})`),
)

// --- character: biggest island ---
const ch = readPNG(path.join(SRC, 'character.png'))
const chBg = sampleBg(ch)
const cbox = components(ch, chBg).sort((a, b) => b.area - a.area)[0]
fs.writeFileSync(path.join(ROOT, 'src/web/assets/character.png'), PNG.sync.write(crop(ch, cbox, chBg)))
console.log(`character → trimmed ${cbox.w}x${cbox.h} at (${cbox.x},${cbox.y})`)
