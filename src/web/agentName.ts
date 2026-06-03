// A stable, friendly coworker name per session id (deterministic).
const NAMES = [
  'Ada', 'Milo', 'Luna', 'Otis', 'Pixel', 'Nova', 'Echo', 'Sol', 'Iris',
  'Leo', 'Mika', 'Juno', 'Remy', 'Pip', 'Bea', 'Cleo', 'Finn', 'Wren',
  'Tilly', 'Ace', 'Gus', 'Hazel', 'Ivy', 'Kit', 'Nico', 'Opal', 'Quincy',
  'Rosa', 'Toby', 'Vera', 'Wally', 'Yuki', 'Zoe', 'Dot', 'Edie', 'Fern',
  'Hugo', 'Indie', 'June', 'Ozzie',
]

export function agentName(sessionId: string): string {
  let h = 0
  for (let i = 0; i < sessionId.length; i++) {
    h = (h * 31 + sessionId.charCodeAt(i)) % 1_000_000_007
  }
  return NAMES[h % NAMES.length]
}
