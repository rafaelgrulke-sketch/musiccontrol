import { supabase } from './supabase'

/** Somente leitura; não realiza login fictício nem altera a sessão atual. */
export async function testarSupabase(): Promise<boolean> {
  const { error } = await supabase.auth.getSession()
  if (error) console.error('Falha ao consultar a sessão do Supabase:', error.message)
  return !error
}
