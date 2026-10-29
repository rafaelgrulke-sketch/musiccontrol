import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { createPortal } from 'react-dom'
import { Camera, Check, Eye, EyeOff, LogOut, Shield, UserRound, UserPlus, X } from 'lucide-react'
import { supabase } from '../supabase'
import './AccountProfile.css'

type Props = { session: Session; role: 'admin' | 'user'; onAdmin: () => void }
const BUCKET = 'profile-avatars'

export default function AccountProfile({ session, role, onAdmin }: Props) {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(String(session.user.user_metadata?.full_name || ''))
  const [email, setEmail] = useState(session.user.email || '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [avatar, setAvatar] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [section, setSection] = useState<'profile' | 'security'>('profile')
  const fileRef = useRef<HTMLInputElement>(null)
  const avatarPath = `${session.user.id}/avatar`

  useEffect(() => { setTarget(document.getElementById('mc-profile-slot')) }, [])
  useEffect(() => {
    setName(String(session.user.user_metadata?.full_name || ''))
    setEmail(session.user.email || '')
  }, [session.user.id, session.user.email, session.user.user_metadata?.full_name])
  useEffect(() => {
    let alive = true
    async function loadAvatar() {
      const { data, error: loadError } = await supabase.storage.from(BUCKET).createSignedUrl(avatarPath, 60 * 60)
      if (alive) setAvatar(!loadError && data ? `${data.signedUrl}&v=${Date.now()}` : null)
    }
    void loadAvatar()
    return () => { alive = false }
  }, [avatarPath])
  useEffect(() => {
    if (!open) return
    function onEscape(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [open])

  function feedback(text: string, isError = false) { setMessage(text); setError(isError) }
  async function saveName(e: FormEvent) {
    e.preventDefault(); setBusy(true); feedback('')
    const trimmed = name.trim()
    if (trimmed.length < 2 || trimmed.length > 80) { feedback('Digite um nome entre 2 e 80 caracteres.', true); setBusy(false); return }
    const { error: updateError } = await supabase.auth.updateUser({ data: { full_name: trimmed } })
    feedback(updateError ? 'Não foi possível salvar o nome. Tente novamente.' : 'Nome atualizado com sucesso.', !!updateError)
    setBusy(false)
  }
  async function saveEmail(e: FormEvent) {
    e.preventDefault(); setBusy(true); feedback('')
    const nextEmail = email.trim().toLowerCase()
    if (!nextEmail || nextEmail === session.user.email?.toLowerCase()) { feedback('Informe um e-mail diferente do atual.', true); setBusy(false); return }
    const { error: updateError } = await supabase.auth.updateUser({ email: nextEmail })
    feedback(updateError ? `Não foi possível alterar o e-mail: ${updateError.message}` : 'Solicitação enviada. Confira sua caixa de entrada e confirme a alteração por e-mail.', !!updateError)
    setBusy(false)
  }
  async function savePassword(e: FormEvent) {
    e.preventDefault(); feedback('')
    if (password.length < 8) { feedback('A senha precisa ter pelo menos 8 caracteres.', true); return }
    if (password !== confirmPassword) { feedback('As senhas não coincidem.', true); return }
    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    feedback(updateError ? `Não foi possível alterar a senha: ${updateError.message}` : 'Senha alterada com sucesso.', !!updateError)
    if (!updateError) { setPassword(''); setConfirmPassword('') }
    setBusy(false)
  }
  async function uploadAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { feedback('Escolha uma imagem JPG, PNG ou WebP.', true); return }
    if (file.size > 2 * 1024 * 1024) { feedback('A foto deve ter no máximo 2 MB.', true); return }
    setBusy(true); feedback('')
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(avatarPath, file, { upsert: true, contentType: file.type, cacheControl: '60' })
    if (uploadError) { feedback('Não foi possível enviar a foto. Confira se o bucket profile-avatars foi configurado no Supabase.', true) }
    else {
      const { data, error: signedError } = await supabase.storage.from(BUCKET).createSignedUrl(avatarPath, 60 * 60)
      if (!signedError && data) setAvatar(`${data.signedUrl}&v=${Date.now()}`)
      feedback('Foto atualizada com sucesso.')
    }
    setBusy(false)
  }
  const initial = (name.trim()[0] || session.user.email?.[0] || 'U').toUpperCase()
  const avatarNode = avatar ? <img src={avatar} alt="Sua foto de perfil" /> : <span>{initial}</span>
  return <>
    {target && createPortal(<button type="button" className="mc-profile-trigger" aria-label="Abrir meu perfil" title="Meu perfil" onClick={() => { feedback(''); setOpen(true) }}>{avatarNode}</button>, target)}
    {open && createPortal(<div className="mc-profile-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false) }}>
      <section className="mc-profile-panel" role="dialog" aria-modal="true" aria-labelledby="mc-profile-heading">
        <header className="mc-profile-heading"><div><span className="mc-profile-kicker">SUA CONTA / MUSICCONTROL</span><h2 id="mc-profile-heading">Meu perfil<span className="mc-profile-period">.</span></h2></div><button className="mc-profile-icon-button" aria-label="Fechar perfil" onClick={() => setOpen(false)}><X size={21}/></button></header>
        <div className="mc-profile-summary"><button className="mc-profile-photo" type="button" onClick={() => fileRef.current?.click()} disabled={busy} title="Alterar foto">{avatarNode}<span className="mc-profile-camera"><Camera size={16}/></span></button><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={uploadAvatar}/><div><strong>{name.trim() || 'Seu nome'}</strong><span>{session.user.email}</span><small>{role === 'admin' ? 'Administrador' : 'Usuário'} · Foto JPG, PNG ou WebP (até 2 MB)</small></div></div>
        <div className="mc-profile-tabs"><button className={section === 'profile' ? 'active' : ''} onClick={() => { setSection('profile'); feedback('') }}><UserRound size={16}/> Dados pessoais</button><button className={section === 'security' ? 'active' : ''} onClick={() => { setSection('security'); feedback('') }}><Shield size={16}/> Segurança</button></div>
        <div className="mc-profile-body">
          {section === 'profile' ? <><form onSubmit={saveName}><label htmlFor="mc-profile-name">Nome de exibição</label><div className="mc-profile-field"><input id="mc-profile-name" autoComplete="name" maxLength={80} value={name} onChange={e => setName(e.target.value)} required/><button type="submit" disabled={busy}><Check size={16}/> Salvar nome</button></div></form><form onSubmit={saveEmail}><label htmlFor="mc-profile-email">E-mail da conta</label><div className="mc-profile-field"><input id="mc-profile-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required/><button type="submit" disabled={busy}>Alterar e-mail</button></div><p className="mc-profile-hint">Por segurança, a alteração pode exigir confirmação no e-mail atual e no novo endereço.</p></form></> : <form onSubmit={savePassword}><label htmlFor="mc-profile-password">Nova senha</label><div className="mc-profile-password"><input id="mc-profile-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo de 8 caracteres" required/><button type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div><label htmlFor="mc-profile-confirm">Confirme a nova senha</label><input id="mc-profile-confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required/><button className="mc-profile-save" disabled={busy} type="submit">Atualizar senha</button><p className="mc-profile-hint">Em algumas configurações do Supabase, será necessário confirmar sua identidade antes da troca.</p></form>}
          {message && <p className={`mc-profile-feedback ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{message}</p>}
        </div>
        <footer className="mc-profile-footer">{role === 'admin' && <button type="button" onClick={() => { setOpen(false); onAdmin() }}><UserPlus size={16}/> Cadastrar usuário</button>}<button type="button" onClick={() => void supabase.auth.signOut()}><LogOut size={16}/> Sair da conta</button></footer>
      </section>
    </div>, document.body)}
  </>
}
