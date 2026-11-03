import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export type MusicControlRole = 'admin' | 'user'
export type MusicControlAuth = { session: Session; role: MusicControlRole }
export const AuthContext = createContext<MusicControlAuth | null>(null)
export function useMusicControlAuth(): MusicControlAuth {
  const context = useContext(AuthContext)
  if (!context) throw new Error('O MusicControl precisa de uma sessão autenticada.')
  return context
}
