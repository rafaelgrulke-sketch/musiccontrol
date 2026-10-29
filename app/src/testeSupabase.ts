
import { supabase } from './supabase'

export async function testarSupabase() {
  console.log('🔄 Testando conexão com Supabase...')

  try {
    const { data, error } = await supabase.auth.getSession()

    if (error) {
      console.error('❌ Erro ao consultar sessão:', error.message)
      return
    }

    console.log('✅ Cliente Supabase configurado!')
    console.log(
      'Sessão:',
      data.session ? 'Usuário conectado' : 'Nenhum usuário conectado'
    )

    // Teste real de comunicação com o servidor
    const { error: authError } =
      await supabase.auth.signInWithPassword({
        email: 'teste-conexao@example.invalid',
        password: 'teste-sem-conta'
      })

    if (authError?.message === 'Invalid login credentials') {
      console.log('✅ Servidor Supabase respondeu!')
      console.log('✅ Comunicação com autenticação funcionando!')
    } else if (authError) {
      console.log('Resposta do servidor:', authError.message)
    } else {
      console.log('Servidor respondeu sem erro.')
    }

  } catch (error) {
    console.error('❌ Falha na comunicação:', error)
  }
}
