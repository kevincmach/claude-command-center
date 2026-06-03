import type { Activity } from '../shared/types.js'

export type RoomId = 'work' | 'gym' | 'library' | 'meeting' | 'break' | 'lounge'

export interface RoomDef {
  id: RoomId
  label: string
  emoji: string
  furniture: string
}

export const ROOMS: RoomDef[] = [
  { id: 'work', label: 'Work Pods', emoji: '🖥️', furniture: '🪑' },
  { id: 'gym', label: 'Gym', emoji: '🏋️', furniture: '🏃' },
  { id: 'break', label: 'Break Room', emoji: '🏓', furniture: '🛋️' },
  { id: 'meeting', label: 'Meeting Room', emoji: '🧩', furniture: '📋' },
  { id: 'library', label: 'Library', emoji: '📚', furniture: '🪴' },
  { id: 'lounge', label: 'Lounge', emoji: '☕', furniture: '🛋️' },
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
