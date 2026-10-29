import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ChangeEvent, PointerEvent as ReactPointerEvent } from 'react'
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
  const [cropImage, setCropImage] = useState<HTMLImageElement | null>(null)
  const [cropUrl, setCropUrl] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const cropCanvas = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
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

  const PREVIEW = 280
  function drawCrop(ctx: CanvasRenderingContext2D, image: HTMLImageElement, size: number, z: number, x: number, y: number) {
    const baseScale = Math.max(size / image.naturalWidth, size / image.naturalHeight)
    const w = image.naturalWidth * baseScale * z
    const h = image.naturalHeight * baseScale * z
    ctx.clearRect(0, 0, size, size)
    ctx.drawImage(image, (size - w) / 2 + x, (size - h) / 2 + y, w, h)
  }
  function clampCrop(image: HTMLImageElement, z: number, x: number, y: number) {
    const scale = Math.max(PREVIEW / image.naturalWidth, PREVIEW / image.naturalHeight) * z
    return {
      x: Math.max(-(image.naturalWidth * scale - PREVIEW) / 2, Math.min((image.naturalWidth * scale - PREVIEW) / 2, x)),
      y: Math.max(-(image.naturalHeight * scale - PREVIEW) / 2, Math.min((image.naturalHeight * scale - PREVIEW) / 2, y)),
    }
  }
  useEffect(() => {
    const canvas = cropCanvas.current
    if (!canvas || !cropImage) return
    const ctx = canvas.getContext('2d')
    if (ctx) drawCrop(ctx, cropImage, PREVIEW, zoom, offset.x, offset.y)
  }, [cropImage, zoom, offset])
  function closeCrop() {
    setCropImage(null)
    setCropUrl(null)
    drag.current = null
  }
  useEffect(() => {
    return () => { if (cropUrl) URL.revokeObjectURL(cropUrl) }
  }, [cropUrl])
  function startDrag(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!cropImage) return
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function moveDrag(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drag.current || !cropImage) return
    const rect = e.currentTarget.getBoundingClientRect()
    const factor = PREVIEW / rect.width
    setOffset(clampCrop(cropImage, zoom, drag.current.ox + (e.clientX - drag.current.x) * factor, drag.current.oy + (e.clientY - drag.current.y) * factor))
  }
  async function saveCroppedAvatar() {
    if (!cropImage || busy) return
    setBusy(true); feedback('')
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 512; canvas.height = 512
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Seu navegador não permite processar a imagem.')
      const factor = 512 / PREVIEW
      drawCrop(ctx, cropImage, 512, zoom, offset.x * factor, offset.y * factor)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88))
      if (!blob) throw new Error('Não foi possível preparar a foto.')
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(avatarPath, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '60' })
      if (uploadError) throw new Error('Falha ao enviar foto. Verifique as permissões do bucket profile-avatars.')
      const { data, error: signedError } = await supabase.storage.from(BUCKET).createSignedUrl(avatarPath, 60 * 60)
      if (signedError || !data) throw new Error('Foto enviada, mas não foi possível carregá-la.')
      setAvatar(`${data.signedUrl}&v=${Date.now()}`)
      feedback('Foto ajustada e salva com sucesso.')
      closeCrop()
    } catch (e) { feedback(e instanceof Error ? e.message : 'Erro ao salvar foto.', true) }
    finally { setBusy(false) }
  }
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
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => { setZoom(1); setOffset({ x: 0, y: 0 }); setCropImage(image); setCropUrl(url) }
    image.onerror = () => { URL.revokeObjectURL(url); feedback('Não foi possível abrir esta imagem.', true) }
    image.src = url
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
    {cropImage && createPortal(<div className="mc-crop-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) closeCrop() }}>
      <section className="mc-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="mc-crop-title">
        <div className="mc-crop-header"><div><span className="mc-profile-kicker">MUSICCONTROL / SUA FOTO</span><h2 id="mc-crop-title">Ajustar foto<span className="mc-profile-period">.</span></h2></div><button type="button" className="mc-profile-icon-button" aria-label="Cancelar edição" disabled={busy} onClick={closeCrop}><X size={20}/></button></div>
        <p className="mc-crop-description">Arraste para posicionar a imagem dentro do círculo e ajuste o zoom.</p>
        <div className="mc-crop-stage"><canvas ref={cropCanvas} width={280} height={280} className="mc-crop-canvas" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }} aria-label="Prévia da foto. Arraste para reposicionar"/><div className="mc-crop-circle" aria-hidden="true"/></div>
        <label className="mc-crop-zoom" htmlFor="mc-crop-zoom">Zoom <strong>{Math.round(zoom * 100)}%</strong></label>
        <input id="mc-crop-zoom" className="mc-crop-slider" type="range" min="1" max="3" step="0.05" value={zoom} onChange={e => { const z = Number(e.target.value); setZoom(z); setOffset(clampCrop(cropImage, z, offset.x, offset.y)) }} />
        <div className="mc-crop-actions"><button type="button" onClick={closeCrop} disabled={busy}>Cancelar</button><button type="button" className="mc-crop-confirm" onClick={() => void saveCroppedAvatar()} disabled={busy}><Check size={17}/>{busy ? 'Salvando…' : 'Salvar foto'}</button></div>
      </section>
    </div>, document.body)}
  </>
}
