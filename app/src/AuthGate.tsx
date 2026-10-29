import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Eye, EyeOff, LockKeyhole, LogOut, UserPlus, Music2, X, ArrowRight, Headphones, ShieldCheck, ListMusic, AudioLines } from 'lucide-react'
import { supabase } from './supabase'
import './AuthGate.css'

type Role = 'admin' | 'user'

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [showAdmin, setShowAdmin] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)

  useEffect(() => {
    let active = true
    let revision = 0
    async function loadSession(next: Session | null) {
      const current = ++revision
      if (!active) return
      setSession(next)
      setRole(null)
      setLoading(true)
      setMessage('')
      if (!next) { setLoading(false); return }
      const { data, error } = await supabase.from('profiles').select('role').eq('id', next.user.id).single()
      if (!active || current !== revision) return
      if (error || (data?.role !== 'admin' && data?.role !== 'user')) {
        setMessage('Perfil não configurado. Peça ao administrador para verificar o banco de dados.')
      } else {
        setRole(data.role)
      }
      setLoading(false)
    }
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      // Deferir consulta ao banco para fora do callback de autenticação.
      setTimeout(() => { if (active) void loadSession(next) }, 0)
    })
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) { setMessage(error.message); setLoading(false) }
      else void loadSession(data.session)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setMessage('Não foi possível entrar. Verifique seu e-mail e senha.')
    setBusy(false)
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (role !== 'admin') return
    if (newPassword.length < 8) { setMessage('A senha precisa ter pelo menos 8 caracteres.'); return }
    setBusy(true); setMessage('')
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: { email: newEmail.trim(), password: newPassword }
    })
    if (error || data?.error) {
      setMessage(data?.error || 'Não foi possível cadastrar. Verifique se a função admin-create-user foi publicada no Supabase.')
    } else {
      setMessage('Usuário cadastrado com sucesso!')
      setNewEmail(''); setNewPassword(''); setShowAdmin(false)
    }
    setBusy(false)
  }

  if (loading) return <div className="mc-auth-page mc-auth-loading"><div className="mc-auth-loading-inner"><Music2 size={28} /> Preparando sua experiência musical...</div></div>
  if (!session || !role) return (
    <main className="mc-auth-page">
      <div className="mc-auth-shell">
        <section className="mc-auth-story" aria-label="Conheça o MusicControl">
          <div className="mc-auth-brand"><div className="mc-brand-symbol"><AudioLines size={25} strokeWidth={2.4}/></div><span>Music<span className="mc-brand-accent">Control</span></span></div>
          <div className="mc-auth-story-body">
            <div className="mc-auth-visual" aria-hidden="true">
              <div className="mc-vinyl"><div className="mc-vinyl-center"><Music2 size={30}/></div></div>
              <div className="mc-auth-wave"><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/></div>
              <div className="mc-visual-caption"><span className="mc-live-dot"/> Seu espaço para ouvir</div>
            </div>
            <h1>Suas músicas.<br/><em>Seu momento.</em></h1>
            <p>Organize o que você ama ouvir. Entre na sua biblioteca e deixe a música acompanhar o seu ritmo.</p>
            <div className="mc-story-features"><span><Headphones size={17}/> Sua biblioteca</span><span><ListMusic size={17}/> Suas playlists</span><span><ShieldCheck size={17}/> Acesso protegido</span></div>
          </div>
          <div className="mc-story-footer">MUSICCONTROL <span>•</span> SEU ESPAÇO MUSICAL</div>
        </section>
        <section className="mc-auth-panel" aria-label="Acessar MusicControl">
          <form className="mc-auth-card" onSubmit={signIn}>
            <div className="mc-auth-mobile-brand"><AudioLines size={23}/> MusicControl</div>
            <div className="mc-form-heading"><h2>Que bom ter você aqui.</h2><p>Entre na sua conta para continuar ouvindo.</p></div>
            {session && !role ? <p className="mc-auth-error" role="alert">{message}</p> : null}
            {!session && <>
              <label htmlFor="mc-email">Seu e-mail</label>
              <input id="mc-email" type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="nome@exemplo.com" />
              <div className="mc-label-line"><label htmlFor="mc-password">Senha</label></div>
              <div className="mc-password-field"><input id="mc-password" type={showPassword ? 'text' : 'password'} required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Digite sua senha" /><button type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={19}/> : <Eye size={19}/>}</button></div>
              {message && <p className="mc-auth-error" role="alert">{message}</p>}
              <button className="mc-auth-primary" disabled={busy} type="submit">{busy ? 'Entrando...' : 'Entrar na minha conta'} {!busy && <ArrowRight size={18}/>}</button>
            </>}
            {session && !role && <button className="mc-auth-primary" type="button" onClick={() => void supabase.auth.signOut()}>Sair e tentar outra conta</button>}
            <div className="mc-auth-note"><LockKeyhole size={15}/><span>Seu acesso é protegido. Novas contas são criadas somente pelo administrador.</span></div>
          </form>
          <p className="mc-auth-panel-footer">MusicControl · Música do seu jeito</p>
        </section>
      </div>
    </main>
  )

  return <>
    {children}
    <div className="mc-account-controls">
      <span title={session.user.email || ''}>{session.user.email}</span>
      {role === 'admin' && <button type="button" onClick={() => { setMessage(''); setShowAdmin(true) }}><UserPlus size={16}/> Cadastrar usuário</button>}
      <button type="button" onClick={() => void supabase.auth.signOut()}><LogOut size={16}/> Sair</button>
    </div>
    {showAdmin && role === 'admin' && <div className="mc-admin-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowAdmin(false) }}>
      <form className="mc-auth-card mc-admin-modal" onSubmit={createUser}>
        <button className="mc-close" type="button" onClick={() => setShowAdmin(false)} aria-label="Fechar"><X size={19}/></button>
        <h2>Cadastrar usuário</h2><p>Somente administradores podem criar contas.</p>
        <label htmlFor="mc-new-email">E-mail do usuário</label>
        <input id="mc-new-email" type="email" autoComplete="off" required value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="usuario@email.com" />
        <label htmlFor="mc-new-password">Senha inicial (mínimo 8 caracteres)</label>
        <div className="mc-password-field"><input id="mc-new-password" type={showNewPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} required value={newPassword} onChange={e => setNewPassword(e.target.value)} /><button type="button" onClick={() => setShowNewPassword(!showNewPassword)} aria-label={showNewPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showNewPassword ? <EyeOff size={19}/> : <Eye size={19}/>}</button></div>
        {message && <p className="mc-auth-error" role="alert">{message}</p>}
        <button className="mc-auth-primary" type="submit" disabled={busy}>{busy ? 'Cadastrando...' : 'Criar usuário'}</button>
      </form>
    </div>}
  </>
}
