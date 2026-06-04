import type { RoomId } from './rooms.js'

// Which furniture props dress each room. Prop names must exist in
// assets/props/names.json (verified by test/roomDecor.test.ts).
export const ROOM_DECOR: Record<RoomId, string[]> = {
  work: ['desk', 'plant'],
  gym: ['water-cooler', 'plant2'],
  library: ['bookshelf', 'plant3'],
  meeting: ['sofa2', 'plant4'],
  break: ['ping-pong', 'sofa'],
  lounge: ['coffee-machine', 'rug'],
}
