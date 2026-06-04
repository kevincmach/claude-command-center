import type { Activity } from '../shared/types.js'

export type RoomId = 'work' | 'gym' | 'library' | 'meeting' | 'break' | 'lounge'
export type FloorId = 'wood' | 'carpet' | 'tile' | 'mat'

export interface RoomDef {
  id: RoomId
  label: string
  emoji: string
  furniture: string
  floor: FloorId
}

export const ROOMS: RoomDef[] = [
  { id: 'work', label: 'Work Pods', emoji: '🖥️', furniture: '🪑', floor: 'wood' },
  { id: 'gym', label: 'Gym', emoji: '🏋️', furniture: '🏃', floor: 'mat' },
  { id: 'break', label: 'Break Room', emoji: '🏓', furniture: '🛋️', floor: 'tile' },
  { id: 'meeting', label: 'Meeting Room', emoji: '🧩', furniture: '📋', floor: 'carpet' },
  { id: 'library', label: 'Library', emoji: '📚', furniture: '🪴', floor: 'wood' },
  { id: 'lounge', label: 'Lounge', emoji: '☕', furniture: '🛋️', floor: 'carpet' },
]

const MAP: Partial<Record<Activity, RoomId>> = {
  working: 'work',
  researching_web: 'gym',
  reading: 'library',
  meeting: 'meeting',
  waiting_permission: 'break',
  waiting_question: 'break',
  idle: 'lounge',
  done: 'lounge',
  planning: 'lounge',
  unknown: 'lounge',
}

export function roomForActivity(a: Activity): RoomId {
  return MAP[a] ?? 'lounge'
}
