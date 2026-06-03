// Stable color per project name: hash → hue, fixed saturation/lightness.
export function projectColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) % 360
  }
  return `hsl(${h} 65% 60%)`
}
