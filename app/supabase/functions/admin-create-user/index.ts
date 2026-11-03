import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}
function response(body: object, status: number) {
  return new Response(JSON.stringify(body), { status, headers: cors })
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return response({ error: 'Método inválido.' }, 405)
  try {
    const authorization = request.headers.get('Authorization') ?? ''
    if (!authorization.startsWith('Bearer ')) return response({ error: 'Acesso não autorizado.' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: current, error: authError } = await admin.auth.getUser(authorization.slice(7))
    if (authError || !current.user) return response({ error: 'Sessão inválida.' }, 401)
    const { data: profile, error: profileError } = await admin.from('profiles')
      .select('role').eq('id', current.user.id).single()
    if (profileError || profile?.role !== 'admin') return response({ error: 'Somente administradores podem criar contas.' }, 403)

    const payload = await request.json().catch(() => null) as { email?: unknown; password?: unknown } | null
    const email = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : ''
    const password = typeof payload?.password === 'string' ? payload.password : ''
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || password.length > 128) {
      return response({ error: 'Informe um e-mail válido e uma senha entre 8 e 128 caracteres.' }, 400)
    }
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) return response({ error: error.message }, 400)
    return response({ id: data.user.id, message: 'Usuário criado.' }, 201)
  } catch {
    return response({ error: 'Erro interno ao cadastrar usuário.' }, 500)
  }
})
