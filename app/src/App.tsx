import { useEffect, useRef, useState } from 'react'
import { Home, Library, ListMusic, Upload, Search, Play, Pause, SkipBack, SkipForward, Volume2, Music2, Plus, Trash2, Disc3, Clock3, Shuffle, Repeat2 } from 'lucide-react'
import './App.css'

type Song = { id: string; title: string; artist: string; url: string }
type Playlist = { id: string; name: string; songIds: string[] }
type Tab = 'home' | 'library' | 'playlists'

const time = (value: number) => Number.isFinite(value) ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}` : '0:00'

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [songs, setSongs] = useState<Song[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.8)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState(false)
  const audio = useRef<HTMLAudioElement>(null)
  const filesInput = useRef<HTMLInputElement>(null)
  const songsRef = useRef<Song[]>([])
  const songsById = songs.find(s => s.id === currentId)
  const activePlaylist = playlists.find(p => p.id === selectedPlaylist)
  const filtered = songs.filter(s => `${s.title} ${s.artist}`.toLowerCase().includes(search.toLowerCase()))

  useEffect(() => { songsRef.current = songs }, [songs])
  useEffect(() => () => { songsRef.current.forEach(s => URL.revokeObjectURL(s.url)) }, [])
  useEffect(() => { if (audio.current) audio.current.volume = volume }, [volume])
  useEffect(() => {
    const el = audio.current
    if (!el) return
    if (!currentId) { el.pause(); return }
    if (playing) el.play().catch(() => setPlaying(false))
    else el.pause()
  }, [currentId, playing])

  function importSongs(files: FileList | null) {
    if (!files?.length) return
    const accepted = Array.from(files).filter(f => f.type.startsWith('audio/') || /\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(f.name))
    if (!accepted.length) { alert('Selecione arquivos de áudio válidos.'); return }
    const added = accepted.map(f => ({ id: crypto.randomUUID(), title: f.name.replace(/\.[^.]+$/, ''), artist: 'Artista desconhecido', url: URL.createObjectURL(f) }))
    setSongs(prev => [...prev, ...added])
    if (!currentId) setCurrentId(added[0].id)
    setTab('library')
  }

  function chooseSong(id: string) {
    if (id === currentId) { setPlaying(p => !p); return }
    setProgress(0); setDuration(0); setCurrentId(id); setPlaying(true)
  }
  function move(direction: number) {
    if (!songs.length) return
    const i = songs.findIndex(s => s.id === currentId)
    const next = shuffle && songs.length > 1 ? (i + 1 + Math.floor(Math.random() * (songs.length - 1))) % songs.length : (i + direction + songs.length) % songs.length
    setProgress(0); setDuration(0); setCurrentId(songs[next].id); setPlaying(true)
  }
  function ended() {
    if (repeat && audio.current) { audio.current.currentTime = 0; audio.current.play().catch(() => setPlaying(false)) }
    else move(1)
  }
  function addPlaylist() {
    const name = window.prompt('Nome da nova playlist:')?.trim()
    if (!name) return
    const id = crypto.randomUUID()
    setPlaylists(p => [...p, { id, name, songIds: [] }]); setSelectedPlaylist(id); setTab('playlists')
  }
  function addToPlaylist(songId: string) {
    if (!playlists.length) { alert('Crie uma playlist primeiro na aba Playlists.'); return }
    const name = window.prompt(`Adicionar a qual playlist?\n${playlists.map((p, i) => `${i + 1}. ${p.name}`).join('\n')}\n\nDigite o número:`)
    const index = Number(name) - 1
    if (!Number.isInteger(index) || !playlists[index]) return
    setPlaylists(prev => prev.map((p, i) => i === index ? { ...p, songIds: [...new Set([...p.songIds, songId])] } : p))
  }
  function deletePlaylist(id: string) {
    if (!window.confirm('Excluir esta playlist? As músicas não serão apagadas.')) return
    setPlaylists(prev => prev.filter(p => p.id !== id)); if (selectedPlaylist === id) setSelectedPlaylist(null)
  }
  function songRow(song: Song, index: number, inPlaylist = false) {
    return <div className={`track ${currentId === song.id ? 'active-track' : ''}`} key={song.id}>
      <span className="track-index">{index + 1}</span>
      <button className="track-cover" onClick={() => chooseSong(song.id)} aria-label={`Reproduzir ${song.title}`}><Music2 size={20}/></button>
      <button className="track-title" onClick={() => chooseSong(song.id)}><strong>{song.title}</strong><small>{song.artist}</small></button>
      <button className="icon-btn track-play" onClick={() => chooseSong(song.id)} aria-label="Reproduzir ou pausar">{currentId === song.id && playing ? <Pause size={18}/> : <Play size={18}/>}</button>
      {inPlaylist ? <button className="icon-btn" title="Remover da playlist" onClick={() => setPlaylists(prev => prev.map(p => p.id === selectedPlaylist ? {...p, songIds: p.songIds.filter(id => id !== song.id)} : p))}><Trash2 size={17}/></button> : <button className="icon-btn" title="Adicionar a uma playlist" onClick={() => addToPlaylist(song.id)}><Plus size={18}/></button>}
    </div>
  }

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><Music2 size={23}/></div><span>Music<span className="brand-accent">Control</span></span></div>
      <div className="nav-label">MENU</div>
      <nav className="navigation">
        <button className={tab === 'home' ? 'nav-active' : ''} onClick={() => setTab('home')}><Home size={20}/> Início</button>
        <button className={tab === 'library' ? 'nav-active' : ''} onClick={() => setTab('library')}><Library size={20}/> Biblioteca</button>
        <button className={tab === 'playlists' ? 'nav-active' : ''} onClick={() => setTab('playlists')}><ListMusic size={20}/> Playlists</button>
      </nav>
      <div className="sidebar-bottom"><Disc3 size={18}/> Sua música. Seu espaço.</div>
    </aside>

    <main className="content">
      <div className="topbar"><span className="eyebrow">SUA EXPERIÊNCIA MUSICAL</span><span className="avatar">MC</span></div>
      {tab === 'home' && <>
        <section className="hero"><div><div className="eyebrow">BEM-VINDO AO MUSICCONTROL</div><h1>O som da sua<br/><em>liberdade.</em></h1><p>Organize suas músicas favoritas e curta cada momento do seu jeito.</p><button className="primary" onClick={() => filesInput.current?.click()}><Upload size={18}/> Importar músicas</button></div><div className="hero-art"><Disc3 size={148} strokeWidth={1}/></div></section>
        <div className="stats"><div className="stat"><Music2 size={22}/><strong>{songs.length}</strong><span>Músicas na biblioteca</span></div><div className="stat"><ListMusic size={22}/><strong>{playlists.length}</strong><span>Playlists criadas</span></div><div className="stat"><Clock3 size={22}/><strong>{currentId ? '1' : '0'}</strong><span>Faixa selecionada</span></div></div>
        <div className="section-head"><h2>Suas músicas</h2><button className="text-button" onClick={() => setTab('library')}>Ver biblioteca →</button></div>
        {songs.length ? <div className="tracks">{songs.slice(0, 6).map((s, i) => songRow(s, i))}</div> : <div className="empty"><Music2 size={38}/><h3>Comece sua coleção</h3><p>Importe seus arquivos MP3 para ouvir no MusicControl.</p><button className="secondary" onClick={() => filesInput.current?.click()}><Plus size={17}/> Adicionar músicas</button></div>}
      </>}
      {tab === 'library' && <>
        <div className="page-head"><div><div className="eyebrow">SUA COLEÇÃO</div><h1>Biblioteca</h1><p>Explore e reproduza suas músicas.</p></div><button className="primary" onClick={() => filesInput.current?.click()}><Upload size={18}/> Adicionar músicas</button></div>
        <div className="library-toolbar"><div className="search"><Search size={19}/><input placeholder="Pesquisar músicas..." value={search} onChange={e => setSearch(e.target.value)}/></div><span>{filtered.length} música(s)</span></div>
        {filtered.length ? <div className="tracks">{filtered.map((s, i) => songRow(s, i))}</div> : <div className="empty"><Library size={38}/><h3>{songs.length ? 'Nenhum resultado' : 'Sua biblioteca está vazia'}</h3><p>{songs.length ? 'Tente outra pesquisa.' : 'Adicione músicas para começar.'}</p></div>}
      </>}
      {tab === 'playlists' && <>
        <div className="page-head"><div><div className="eyebrow">ORGANIZE SEU SOM</div><h1>Playlists</h1><p>Crie coleções para cada momento.</p></div><button className="primary" onClick={addPlaylist}><Plus size={18}/> Nova playlist</button></div>
        {!playlists.length ? <div className="empty"><ListMusic size={38}/><h3>Suas playlists começam aqui</h3><p>Crie sua primeira playlist para organizar suas músicas.</p><button className="secondary" onClick={addPlaylist}><Plus size={17}/> Criar playlist</button></div> : <><div className="playlist-grid">{playlists.map(p => <button key={p.id} className={`playlist-card ${selectedPlaylist === p.id ? 'playlist-selected' : ''}`} onClick={() => setSelectedPlaylist(p.id)}><div className="playlist-art"><ListMusic size={33}/></div><strong>{p.name}</strong><small>{p.songIds.length} música(s)</small></button>)}</div>{activePlaylist && <section className="playlist-details"><div className="section-head"><h2>{activePlaylist.name}</h2><button className="text-button danger" onClick={() => deletePlaylist(activePlaylist.id)}><Trash2 size={16}/> Excluir playlist</button></div>{activePlaylist.songIds.length ? <div className="tracks">{activePlaylist.songIds.map(id => songs.find(s => s.id === id)).filter((s): s is Song => !!s).map((s, i) => songRow(s, i, true))}</div> : <p className="muted">Playlist vazia. Vá à Biblioteca e clique em + ao lado de uma música para adicioná-la.</p>}</section>}</>}
      </>}
    </main>

    <footer className="player"><div className="now-playing"><div className="now-cover"><Music2 size={24}/></div><div className="now-text"><strong>{songsById?.title ?? 'Escolha uma música'}</strong><small>{songsById?.artist ?? 'MusicControl'}</small></div></div><div className="player-center"><div className="player-buttons"><button className={`icon-btn optional ${shuffle ? 'toggled' : ''}`} onClick={() => setShuffle(s => !s)} title="Aleatório"><Shuffle size={17}/></button><button className="icon-btn" onClick={() => move(-1)} disabled={!songs.length} aria-label="Anterior"><SkipBack size={21}/></button><button className="play-main" onClick={() => setPlaying(p => !p)} disabled={!currentId} aria-label={playing ? 'Pausar' : 'Reproduzir'}>{playing ? <Pause size={21} fill="currentColor"/> : <Play size={21} fill="currentColor"/>}</button><button className="icon-btn" onClick={() => move(1)} disabled={!songs.length} aria-label="Próxima"><SkipForward size={21}/></button><button className={`icon-btn optional ${repeat ? 'toggled' : ''}`} onClick={() => setRepeat(s => !s)} title="Repetir faixa"><Repeat2 size={17}/></button></div><div className="seek"><span>{time(progress)}</span><input type="range" min={0} max={duration || 1} step={0.1} value={Math.min(progress, duration || 1)} onChange={e => { const t = Number(e.target.value); if (audio.current) audio.current.currentTime = t; setProgress(t) }}/><span>{time(duration)}</span></div></div><div className="volume"><Volume2 size={19}/><input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={e => setVolume(Number(e.target.value))}/></div></footer>
    <input ref={filesInput} className="hidden-input" type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac,.flac" multiple onChange={e => { importSongs(e.target.files); e.target.value = '' }}/>
    <audio ref={audio} src={songsById?.url} preload="metadata" onLoadedMetadata={e => { setDuration(e.currentTarget.duration || 0); if (playing) e.currentTarget.play().catch(() => setPlaying(false)) }} onCanPlay={e => { if (playing && e.currentTarget.paused) e.currentTarget.play().catch(() => setPlaying(false)) }} onTimeUpdate={e => setProgress(e.currentTarget.currentTime)} onEnded={ended} onError={() => { if (songsById) { setPlaying(false); alert('Não foi possível reproduzir este arquivo. Tente um MP3 compatível.') } }}/>
  </div>
}
