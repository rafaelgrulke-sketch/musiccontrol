import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { parseBlob } from 'music-metadata'
import { 
  Home, Library, ListMusic, Upload, Search, Play, Pause, 
  SkipBack, SkipForward, Volume2, Music2, Plus, Trash2, 
  Disc3, Shuffle, Repeat2, UsersRound, ImagePlus, Pencil, 
  RefreshCw, X, CheckCircle2, AlertCircle, Images 
} from 'lucide-react'
import './App.css'
import './redesign.css'
import './theme2.css'
import './editorial21.css'
import CinematicScene from './components/CinematicScene'
import { testarSupabase } from './testeSupabase'

type Song = { id: string; title: string; artist: string; album?: string; url: string; coverUrl?: string }
type Playlist = { id: string; name: string; songIds: string[] }
type Tab = 'home' | 'library' | 'playlists' | 'artists'
type Dialog =
  | { kind: 'createPlaylist'; songId?: string }
  | { kind: 'choosePlaylist'; songId: string }
  | { kind: 'editSong'; songId: string }
  | { kind: 'renameArtist'; artist: string }
  | { kind: 'deletePlaylist'; playlistId: string }
  | { kind: 'deleteSong'; songId: string }
type Notice = { text: string; error?: boolean }

type StoredSong = { id: string; title: string; artist: string; album?: string; cover?: Blob; file: Blob; importedAt: number }
const DB_NAME = 'musiccontrol-library'
const DB_VERSION = 1
let dbPromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('Este navegador não oferece suporte a IndexedDB.'))
        return
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('songs')) db.createObjectStore('songs', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('Não foi possível abrir a biblioteca.'))
      request.onblocked = () => reject(new Error('Feche outras abas do MusicControl e recarregue a página.'))
    }).catch(error => {
      dbPromise = null
      throw error
    })
  }
  return dbPromise!
}

async function getRecords<T>(storeName: string): Promise<T[]> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const request = tx.objectStore(storeName).getAll()
    request.onsuccess = () => resolve(request.result as T[])
    request.onerror = () => reject(tx.error ?? new Error('Erro na leitura dos dados.'))
  })
}

async function getRecord<T>(storeName: string, id: string): Promise<T | undefined> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(id)
    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(request.error ?? new Error('Erro ao consultar o arquivo.'))
  })
}

async function putRecord(storeName: string, value: unknown): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Erro ao gravar os dados.'))
    tx.onabort = () => reject(tx.error ?? new Error('Gravação cancelada.'))
    tx.objectStore(storeName).put(value)
  })
}

async function deleteRecord(storeName: string, id: string): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Erro ao excluir registro.'))
    tx.onabort = () => reject(tx.error ?? new Error('Exclusão cancelada.'))
    tx.objectStore(storeName).delete(id)
  })
}

let playlistQueue: Promise<void> = Promise.resolve()
function persistPlaylists(playlists: Playlist[]): Promise<void> {
  playlistQueue = playlistQueue.catch(() => {}).then(() =>
    putRecord('settings', { key: 'playlists', value: playlists })
  )
  return playlistQueue
}

const artistKey = (name: string) => name.trim().toLocaleLowerCase('pt-BR')
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
  const [ready, setReady] = useState(false)
  const [importing, setImporting] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [artistPhotos, setArtistPhotos] = useState<Record<string, string>>({})
  const photoArtist = useRef<string>('')
  const photosRef = useRef<Record<string, string>>({})
  const artistPhotoInput = useRef<HTMLInputElement>(null)
  const [storageError, setStorageError] = useState('')
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [draftPlaylist, setDraftPlaylist] = useState('')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftArtist, setDraftArtist] = useState('')
  const [draftAlbum, setDraftAlbum] = useState('')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [removeCover, setRemoveCover] = useState(false)
  const [savingDialog, setSavingDialog] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const dialogInput = useRef<HTMLInputElement>(null)

  const audio = useRef<HTMLAudioElement>(null)
  const filesInput = useRef<HTMLInputElement>(null)
  const songsRef = useRef<Song[]>([])
  const songsById = songs.find(s => s.id === currentId)
  const activePlaylist = playlists.find(p => p.id === selectedPlaylist)
  const dialogSong = dialog && ('songId' in dialog) ? songs.find(s => s.id === dialog.songId) : undefined
  const dialogPlaylist = dialog?.kind === 'deletePlaylist' ? playlists.find(p => p.id === dialog.playlistId) : undefined
  const filtered = songs.filter(s => `${s.title} ${s.artist} ${s.album ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  const artists = Object.values(songs.reduce<Record<string, { name: string; count: number }>>((acc, song) => {
    const key = artistKey(song.artist)
    if (!acc[key]) acc[key] = { name: song.artist, count: 0 }
    acc[key].count++
    return acc
  }, {})).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  // Teste de comunicação com o servidor Supabase
  useEffect(() => {
    void testarSupabase()
  }, [])

  useEffect(() => {
    let cancelled = false
    async function restoreLibrary() {
      let restored: Song[] = []
      try {
        const [stored, settings] = await Promise.all([
          getRecords<StoredSong>('songs'),
          getRecords<{ key: string; value: Playlist[] | Blob }>('settings')
        ])
        restored = stored.sort((a, b) => a.importedAt - b.importedAt).map(s => ({
          id: s.id,
          title: s.title,
          artist: s.artist,
          album: s.album,
          coverUrl: s.cover ? URL.createObjectURL(s.cover) : undefined,
          url: URL.createObjectURL(s.file)
        }))
        if (cancelled) {
          restored.forEach(s => { URL.revokeObjectURL(s.url); if (s.coverUrl) URL.revokeObjectURL(s.coverUrl) })
          return
        }
        const savedPlaylists = settings.find(s => s.key === 'playlists')?.value
        const restoredPhotos: Record<string, string> = {}
        settings.forEach(setting => {
          if (setting.key.startsWith('artist-photo:') && setting.value instanceof Blob) {
            restoredPhotos[setting.key.slice('artist-photo:'.length)] = URL.createObjectURL(setting.value)
          }
        })
        setArtistPhotos(restoredPhotos)
        setSongs(restored)
        setPlaylists(Array.isArray(savedPlaylists) ? savedPlaylists : [])
        setCurrentId(null)
      } catch (error) {
        if (!cancelled) {
          console.error('Erro ao abrir biblioteca local:', error)
          setStorageError('Não foi possível abrir o armazenamento local do navegador.')
        }
      } finally {
        if (!cancelled) setReady(true)
      }
    }
    void restoreLibrary()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!ready || storageError) return
    void persistPlaylists(playlists).catch(error => {
      console.error('Erro ao salvar playlists:', error)
      setStorageError('Falha ao persistir playlists no navegador.')
    })
  }, [playlists, ready, storageError])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(null), 4000)
    return () => window.clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    if (!dialog) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingDialog) setDialog(null)
    }
    window.addEventListener('keydown', handleKey)
    const focusTimeout = window.setTimeout(() => dialogInput.current?.focus(), 40)
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.clearTimeout(focusTimeout)
    }
  }, [dialog, savingDialog])

  useEffect(() => () => {
    if (coverPreview) URL.revokeObjectURL(coverPreview)
  }, [coverPreview])

  useEffect(() => { songsRef.current = songs }, [songs])
  useEffect(() => { photosRef.current = artistPhotos }, [artistPhotos])
  useEffect(() => () => {
    songsRef.current.forEach(s => { URL.revokeObjectURL(s.url); if (s.coverUrl) URL.revokeObjectURL(s.coverUrl) })
    Object.values(photosRef.current).forEach(url => URL.revokeObjectURL(url))
  }, [])

  useEffect(() => { if (audio.current) audio.current.volume = volume }, [volume])
  useEffect(() => {
    const el = audio.current
    if (!el) return
    if (!currentId) { el.pause(); return }
    if (playing) el.play().catch(() => setPlaying(false))
    else el.pause()
  }, [currentId, playing])

  async function readTags(file: Blob, filename: string): Promise<{ title: string; artist: string; album?: string; cover?: Blob }> {
    const fallback = { title: filename.replace(/\.[^.]+$/, ''), artist: 'Artista desconhecido' }
    try {
      const metadata = await parseBlob(file)
      const picture = metadata.common.picture?.[0]
      const cover = picture && picture.data.byteLength <= 10 * 1024 * 1024
        ? new Blob([new Uint8Array(picture.data)], { type: picture.format || 'image/jpeg' })
        : undefined
      return {
        title: metadata.common.title?.trim() || fallback.title,
        artist: metadata.common.artist?.trim() || fallback.artist,
        album: metadata.common.album?.trim() || undefined,
        cover
      }
    } catch {
      return fallback
    }
  }

  async function importSongs(files: FileList | null) {
    if (!files?.length || importing) return
    if (!ready || storageError) {
      setNotice({ text: 'A biblioteca local não está acessível no momento.', error: true })
      return
    }
    const accepted = Array.from(files).filter(f =>
      f.type.startsWith('audio/') || /\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(f.name)
    )
    if (!accepted.length) {
      setNotice({ text: 'Formato inválido. Selecione arquivos de áudio suportados.', error: true })
      return
    }
    setImporting(true)
    const added: Song[] = []
    let failures = 0
    try {
      for (const file of accepted) {
        const id = crypto.randomUUID()
        const tags = await readTags(file, file.name)
        try {
          await putRecord('songs', { id, ...tags, file, importedAt: Date.now() } satisfies StoredSong)
          added.push({ id, title: tags.title, artist: tags.artist, album: tags.album, url: URL.createObjectURL(file), coverUrl: tags.cover ? URL.createObjectURL(tags.cover) : undefined })
        } catch {
          failures++
        }
      }
      if (added.length) {
        setNotice({ text: `${added.length} faixa(s) importada(s) com sucesso.` })
        setSongs(prev => [...prev, ...added])
        setTab('library')
      }
      if (failures) {
        setNotice({ text: `${failures} faixa(s) não puderam ser armazenadas. Verifique o espaço livre.`, error: true })
      }
    } finally {
      setImporting(false)
    }
  }

  async function removeSongConfirmed(songId: string) {
    const target = songs.find(s => s.id === songId)
    if (!target) return
    setSavingDialog(true)
    try {
      await deleteRecord('songs', songId)
      if (currentId === songId) {
        setPlaying(false); setCurrentId(null); setProgress(0); setDuration(0)
      }
      setSongs(prev => prev.filter(s => s.id !== songId))
      setPlaylists(prev => prev.map(p => ({ ...p, songIds: p.songIds.filter(id => id !== songId) })))
      window.setTimeout(() => {
        URL.revokeObjectURL(target.url)
        if (target.coverUrl) URL.revokeObjectURL(target.coverUrl)
      }, 500)
      setDialog(null)
      setNotice({ text: `“${target.title}” excluída.` })
    } catch {
      setNotice({ text: 'Falha ao remover arquivo do IndexedDB.', error: true })
    } finally { setSavingDialog(false) }
  }

  async function rescanMetadata() {
    if (scanning || !ready) return
    setScanning(true)
    let updated = 0
    try {
      const stored = await getRecords<StoredSong>('songs')
      for (const old of stored) {
        if (old.cover && old.artist !== 'Artista desconhecido' && old.album) continue
        const tags = await readTags(old.file, old.title)
        const revised: StoredSong = {
          ...old,
          title: old.title || tags.title,
          artist: old.artist === 'Artista desconhecido' ? tags.artist : old.artist,
          album: old.album || tags.album,
          cover: old.cover || tags.cover
        }
        if (revised.artist === old.artist && revised.album === old.album && revised.cover === old.cover) continue
        await putRecord('songs', revised)
        setSongs(prev => prev.map(s => {
          if (s.id !== old.id) return s
          const newCoverUrl = revised.cover && revised.cover !== old.cover ? URL.createObjectURL(revised.cover) : s.coverUrl
          if (newCoverUrl !== s.coverUrl && s.coverUrl) window.setTimeout(() => URL.revokeObjectURL(s.coverUrl!), 500)
          return { ...s, artist: revised.artist, album: revised.album, coverUrl: newCoverUrl }
        }))
        updated++
      }
      setNotice({ text: updated ? `${updated} música(s) atualizadas com metadados.` : 'Nenhum novo metadado localizado.' })
    } catch {
      setNotice({ text: 'Erro ao resgatar metadados.', error: true })
    } finally {
      setScanning(false)
    }
  }

  function openEditSong(song: Song) {
    setDraftTitle(song.title)
    setDraftArtist(song.artist)
    setDraftAlbum(song.album ?? '')
    setCoverFile(null)
    setCoverPreview(null)
    setRemoveCover(false)
    setDialog({ kind: 'editSong', songId: song.id })
  }

  function chooseNewCover(file?: File) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setNotice({ text: 'Selecione uma imagem válida.', error: true }); return
    }
    if (file.size > 5 * 1024 * 1024) {
      setNotice({ text: 'Tamanho máximo da imagem: 5 MB.', error: true }); return
    }
    setCoverFile(file)
    setRemoveCover(false)
    setCoverPreview(URL.createObjectURL(file))
  }

  async function saveSongEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!dialogSong || !draftTitle.trim() || !draftArtist.trim() || savingDialog) return
    setSavingDialog(true)
    try {
      const stored = await getRecord<StoredSong>('songs', dialogSong.id)
      if (!stored) throw new Error('Não localizado.')
      const newCover = removeCover ? undefined : (coverFile ?? stored.cover)
      const edited = {
        ...stored,
        title: draftTitle.trim(),
        artist: draftArtist.trim(),
        album: draftAlbum.trim(),
        cover: newCover
      } satisfies StoredSong
      await putRecord('songs', edited)
      const oldUrl = dialogSong.coverUrl
      const newUrl = newCover && (removeCover || coverFile) ? URL.createObjectURL(newCover) : (removeCover ? undefined : oldUrl)
      setSongs(prev => prev.map(song => song.id === dialogSong.id
        ? { ...song, title: edited.title, artist: edited.artist, album: edited.album, coverUrl: newUrl }
        : song))
      if (oldUrl && oldUrl !== newUrl) window.setTimeout(() => URL.revokeObjectURL(oldUrl), 500)
      setDialog(null)
      setNotice({ text: 'Faixa atualizada.' })
    } catch {
      setNotice({ text: 'Falha ao salvar edições.', error: true })
    } finally { setSavingDialog(false) }
  }

  function openRenameArtist(artist: string) {
    setDraftArtist(artist)
    setDialog({ kind: 'renameArtist', artist })
  }

  async function saveArtistName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (dialog?.kind !== 'renameArtist' || !draftArtist.trim() || savingDialog) return
    const oldKey = artistKey(dialog.artist)
    const newName = draftArtist.trim()
    const newKey = artistKey(newName)
    setSavingDialog(true)
    try {
      const allSongs = await getRecords<StoredSong>('songs')
      const targets = allSongs.filter(song => artistKey(song.artist) === oldKey)
      for (const song of targets) await putRecord('songs', { ...song, artist: newName })
      if (newKey !== oldKey && artistPhotos[oldKey]) {
        const photo = await getRecord<{ key: string; value: Blob }>('settings', `artist-photo:${oldKey}`)
        if (photo && !artistPhotos[newKey]) {
          await putRecord('settings', { key: `artist-photo:${newKey}`, value: photo.value })
          const newUrl = URL.createObjectURL(photo.value)
          setArtistPhotos(prev => ({ ...prev, [newKey]: newUrl }))
        }
      }
      setSongs(prev => prev.map(song => artistKey(song.artist) === oldKey ? { ...song, artist: newName } : song))
      setDialog(null)
      setNotice({ text: `Artista atualizado em ${targets.length} faixa(s).` })
    } catch {
      setNotice({ text: 'Não foi possível atualizar o nome em todas as músicas.', error: true })
    } finally { setSavingDialog(false) }
  }

  function chooseArtistPhoto(artist: string) {
    photoArtist.current = artist
    artistPhotoInput.current?.click()
  }

  async function saveArtistPhoto(file: File | undefined) {
    const key = artistKey(photoArtist.current)
    if (!file || !key) return
    if (!file.type.startsWith('image/')) { setNotice({ text: 'Formato de imagem inválido.', error: true }); return }
    if (file.size > 5 * 1024 * 1024) { setNotice({ text: 'O arquivo não pode exceder 5 MB.', error: true }); return }
    try {
      await putRecord('settings', { key: `artist-photo:${key}`, value: file })
      const url = URL.createObjectURL(file)
      const oldUrl = photosRef.current[key]
      setArtistPhotos(prev => ({ ...prev, [key]: url }))
      if (oldUrl) window.setTimeout(() => URL.revokeObjectURL(oldUrl), 500)
      setNotice({ text: 'Foto sincronizada com sucesso.' })
    } catch {
      setNotice({ text: 'Erro ao persistir imagem.', error: true })
    }
  }

  function cover(song: Song) {
    return song.coverUrl
      ? <img className="cover-photo" src={song.coverUrl} alt={song.title} />
      : <Music2 size={18}/>
  }

  function chooseSong(id: string) {
    if (id === currentId) { setPlaying(p => !p); return }
    setProgress(0); setDuration(0); setCurrentId(id); setPlaying(true)
  }

  function move(direction: number) {
    if (!songs.length) return
    const i = songs.findIndex(s => s.id === currentId)
    const next = shuffle && songs.length > 1 
      ? (i + 1 + Math.floor(Math.random() * (songs.length - 1))) % songs.length 
      : (i + direction + songs.length) % songs.length
    setProgress(0); setDuration(0); setCurrentId(songs[next].id); setPlaying(true)
  }

  function ended() {
    if (repeat && audio.current) { audio.current.currentTime = 0; audio.current.play().catch(() => setPlaying(false)) }
    else move(1)
  }

  function addPlaylist(songId?: string) {
    setDraftPlaylist('')
    setDialog({ kind: 'createPlaylist', songId })
  }

  function createPlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = draftPlaylist.trim()
    if (!name || savingDialog) return
    if (playlists.some(p => p.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) {
      setNotice({ text: 'Uma playlist com esse título já existe.', error: true })
      return
    }
    const id = crypto.randomUUID()
    const songIds = dialog?.kind === 'createPlaylist' && dialog.songId ? [dialog.songId] : []
    setPlaylists(prev => [...prev, { id, name, songIds }])
    setSelectedPlaylist(id)
    setTab('playlists')
    setDialog(null)
    setNotice({ text: `Playlist “${name}” criada.` })
  }

  function addToPlaylist(songId: string) {
    setDialog({ kind: 'choosePlaylist', songId })
  }

  function confirmAddToPlaylist(playlistId: string, songId: string) {
    const selected = playlists.find(p => p.id === playlistId)
    if (!selected) return
    const exists = selected.songIds.includes(songId)
    if (!exists) {
      setPlaylists(prev => prev.map(p => p.id === playlistId ? { ...p, songIds: [...p.songIds, songId] } : p))
    }
    setDialog(null)
    setNotice({ text: exists ? 'Faixa já presente nesta playlist.' : `Faixa adicionada a “${selected.name}”.` })
  }

  function deletePlaylistConfirmed(id: string) {
    const target = playlists.find(p => p.id === id)
    setPlaylists(prev => prev.filter(p => p.id !== id))
    if (selectedPlaylist === id) setSelectedPlaylist(null)
    setDialog(null)
    setNotice({ text: target ? `Playlist “${target.name}” removida.` : 'Playlist removida.' })
  }

  function songRow(song: Song, index: number, inPlaylist = false) {
    const isCurrent = currentId === song.id
    return (
      <div className={`track ${isCurrent ? 'active-track' : ''}`} key={song.id}>
        <span className="track-index">{index + 1}</span>
        <button className="track-cover" onClick={() => chooseSong(song.id)} aria-label={`Tocar ${song.title}`}>
          {cover(song)}
        </button>
        <button className="track-title" onClick={() => chooseSong(song.id)}>
          <strong>{song.title}</strong>
          <small>{song.artist}{song.album ? ` • ${song.album}` : ''}</small>
        </button>
        <button className="icon-btn track-play" onClick={() => chooseSong(song.id)} aria-label="Play/Pause">
          {isCurrent && playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <div className="track-actions">
          <button className="icon-btn" title="Editar informações" onClick={() => openEditSong(song)}>
            <Pencil size={15}/>
          </button>
          {inPlaylist ? (
            <button className="icon-btn" title="Remover da playlist" onClick={() => setPlaylists(prev => prev.map(p => p.id === selectedPlaylist ? {...p, songIds: p.songIds.filter(id => id !== song.id)} : p))}>
              <Trash2 size={15}/>
            </button>
          ) : (
            <>
              <button className="icon-btn" title="Adicionar à playlist" onClick={() => addToPlaylist(song.id)}>
                <Plus size={16}/>
              </button>
              <button className="icon-btn" title="Excluir da biblioteca" onClick={() => setDialog({ kind: 'deleteSong', songId: song.id })}>
                <Trash2 size={15}/>
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`shell ${songsById ? "has-player" : "no-player"}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><Music2 size={20}/></div>
          <span>Music<span className="brand-accent">Control</span></span>
        </div>

        <div className="nav-label">COLEÇÃO</div>
        <nav className="navigation">
          <button className={tab === 'home' ? 'nav-active' : ''} onClick={() => setTab('home')}><Home size={18}/> <span>Início</span></button>
          <button className={tab === 'library' ? 'nav-active' : ''} onClick={() => setTab('library')}><Library size={18}/> <span>Biblioteca</span></button>
          <button className={tab === 'playlists' ? 'nav-active' : ''} onClick={() => setTab('playlists')}><ListMusic size={18}/> <span>Playlists</span></button>
          <button className={tab === 'artists' ? 'nav-active' : ''} onClick={() => setTab('artists')}><UsersRound size={18}/> <span>Artistas</span></button>
        </nav>

        <div className="sidebar-bottom">
          <Disc3 size={16}/> MUSICCONTROL <span>2.1</span>
        </div>
      </aside>

      <main className="content">
        <div className="topbar">
          <span className="topbar-location">
            Coleção <span className="topbar-separator">/</span> 
            {tab === "home" ? "Início" : tab === "library" ? "Biblioteca" : tab === "artists" ? "Artistas" : "Playlists"}
          </span>
          <div id="mc-profile-slot" />
        </div>

        {storageError && <p className="muted" role="alert">{storageError}</p>}

        {tab === 'home' && (
          <>
            <section className="hero mc2-hero">
              <CinematicScene />
              <div className="hero-copy">
                <span className="hero-caption">MUSICCONTROL / EDIÇÃO 2.1</span>
                <h1>O SOM NO<br/><em>SEU RITMO.</em></h1>
                <p>Reproduza álbuns e faixas sem intermediários, diretamente do armazenamento protegido do seu navegador.</p>
                <div className="hero-actions">
                  <button className="primary" disabled={!ready || importing || !!storageError} onClick={() => filesInput.current?.click()}>
                    <Upload size={16}/> {importing ? 'Importando...' : 'Adicionar músicas'}
                  </button>
                  {songs.length > 0 && (
                    <button className="hero-link" onClick={() => setTab('library')}>
                      Ver biblioteca completa →
                    </button>
                  )}
                </div>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="vinyl">
                  <div className="vinyl-center"><Music2 size={28}/></div>
                </div>
              </div>
            </section>

            <div className="collection-strip">
              <span><strong>{songs.length}</strong> {songs.length === 1 ? 'faixa' : 'faixas'}</span>
              <i/>
              <span><strong>{artists.length}</strong> {artists.length === 1 ? 'artista' : 'artistas'}</span>
              <i/>
              <span><strong>{playlists.length}</strong> {playlists.length === 1 ? 'playlist' : 'playlists'}</span>
            </div>

            {artists.length > 0 && (
              <>
                <div className="section-head">
                  <h2>Artistas em destaque</h2>
                  <button className="text-button" onClick={() => setTab('artists')}>Todos os artistas</button>
                </div>
                <div className="artist-grid">
                  {artists.slice(0, 6).map(artist => (
                    <button key={artistKey(artist.name)} className="artist-card" onClick={() => setTab('artists')}>
                      <div className="artist-avatar">
                        {artistPhotos[artistKey(artist.name)] ? <img src={artistPhotos[artistKey(artist.name)]} alt={artist.name}/> : <UsersRound size={26}/>}
                      </div>
                      <strong>{artist.name}</strong>
                      <small>{artist.count} faixa(s)</small>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="section-head">
              <h2>Adicionadas recentemente</h2>
              <button className="text-button" onClick={() => setTab('library')}>Ver acervo</button>
            </div>
            {songs.length ? (
              <div className="tracks">{songs.slice(0, 8).map((s, i) => songRow(s, i))}</div>
            ) : (
              <div className="empty">
                <Music2 size={36}/>
                <h3>Seu catálogo está vazio</h3>
                <p>Importe arquivos de áudio (MP3, FLAC, WAV) para começar a ouvir.</p>
                <button className="secondary" disabled={!ready || importing || !!storageError} onClick={() => filesInput.current?.click()}>
                  <Plus size={16}/> Carregar arquivos
                </button>
              </div>
            )}
          </>
        )}

        {tab === 'library' && (
          <>
            <div className="page-head">
              <div>
                <div className="eyebrow">ACERVO</div>
                <h1>Biblioteca</h1>
                <p>Gerencie e execute suas faixas salvas localmente.</p>
              </div>
              <button className="primary" disabled={!ready || importing || !!storageError} onClick={() => filesInput.current?.click()}>
                <Upload size={16}/> {importing ? 'Importando...' : 'Adicionar músicas'}
              </button>
            </div>

            <div className="library-toolbar">
              <div className="search">
                <Search size={16}/>
                <input placeholder="Filtrar por faixa, artista ou álbum..." value={search} onChange={e => setSearch(e.target.value)}/>
              </div>
              <span>{filtered.length} {filtered.length === 1 ? 'música encontrada' : 'músicas encontradas'}</span>
            </div>

            {filtered.length ? (
              <div className="tracks">{filtered.map((s, i) => songRow(s, i))}</div>
            ) : (
              <div className="empty">
                <Library size={36}/>
                <h3>{songs.length ? 'Nenhum resultado para a busca' : 'Biblioteca vazia'}</h3>
                <p>{songs.length ? 'Verifique a grafia ou limpe o campo de busca.' : 'Adicione faixas de áudio para gerenciar seu acervo.'}</p>
              </div>
            )}
          </>
        )}

        {tab === 'artists' && (
          <>
            <div className="page-head">
              <div>
                <div className="eyebrow">CATÁLOGO</div>
                <h1>Artistas</h1>
                <p>Agrupamento automático de faixas por artista.</p>
              </div>
              <button className="secondary" onClick={() => void rescanMetadata()} disabled={scanning || !ready}>
                <RefreshCw size={16}/> {scanning ? 'Sincronizando...' : 'Ler metadados ID3'}
              </button>
            </div>

            {!artists.length ? (
              <div className="empty">
                <UsersRound size={36}/>
                <h3>Nenhum artista detectado</h3>
                <p>Adicione músicas para que os artistas sejam listados aqui.</p>
              </div>
            ) : (
              <div className="artist-list">
                {artists.map(artist => {
                  const artistSongs = songs.filter(s => artistKey(s.artist) === artistKey(artist.name))
                  const photoUrl = artistPhotos[artistKey(artist.name)]
                  return (
                    <section className="artist-section" key={artistKey(artist.name)}>
                      <div className="artist-heading">
                        <div className="artist-avatar">
                          {photoUrl ? <img src={photoUrl} alt={artist.name}/> : <UsersRound size={28}/>}
                        </div>
                        <div className="artist-heading-text">
                          <h2>{artist.name}</h2>
                          <span>{artist.count} faixa(s) na biblioteca</span>
                        </div>
                        <button className="secondary" onClick={() => openRenameArtist(artist.name)}>
                          <Pencil size={15}/> Renomear
                        </button>
                        <button className="secondary" onClick={() => chooseArtistPhoto(artist.name)}>
                          <ImagePlus size={15}/> {photoUrl ? 'Alterar foto' : 'Foto'}
                        </button>
                      </div>
                      <div className="tracks">{artistSongs.map((song, index) => songRow(song, index))}</div>
                    </section>
                  )
                })}
              </div>
            )}
          </>
        )}

        {tab === 'playlists' && (
          <>
            <div className="page-head">
              <div>
                <div className="eyebrow">CURADORIA</div>
                <h1>Playlists</h1>
                <p>Organize suas seleções de faixas.</p>
              </div>
              <button className="primary" onClick={() => addPlaylist()}>
                <Plus size={16}/> Nova playlist
              </button>
            </div>

            {!playlists.length ? (
              <div className="empty">
                <ListMusic size={36}/>
                <h3>Nenhuma playlist criada</h3>
                <p>Organize suas audições criando seleções temáticas.</p>
                <button className="secondary" onClick={() => addPlaylist()}>
                  <Plus size={16}/> Criar primeira playlist
                </button>
              </div>
            ) : (
              <>
                <div className="playlist-grid">
                  {playlists.map(p => (
                    <button key={p.id} className={`playlist-card ${selectedPlaylist === p.id ? 'playlist-selected' : ''}`} onClick={() => setSelectedPlaylist(p.id)}>
                      <div className="playlist-art"><ListMusic size={28}/></div>
                      <strong>{p.name}</strong>
                      <small>{p.songIds.length} faixa(s)</small>
                    </button>
                  ))}
                </div>

                {activePlaylist && (
                  <section style={{ marginTop: '36px' }}>
                    <div className="section-head">
                      <h2>{activePlaylist.name}</h2>
                      <button className="text-button danger" onClick={() => setDialog({ kind: 'deletePlaylist', playlistId: activePlaylist.id })}>
                        <Trash2 size={15}/> Excluir playlist
                      </button>
                    </div>
                    {activePlaylist.songIds.length ? (
                      <div className="tracks">
                        {activePlaylist.songIds
                          .map(id => songs.find(s => s.id === id))
                          .filter((s): s is Song => !!s)
                          .map((s, i) => songRow(s, i, true))}
                      </div>
                    ) : (
                      <p className="muted" style={{ padding: '16px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
                        Nenhuma música adicionada ainda a esta playlist.
                      </p>
                    )}
                  </section>
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* Docked Control Deck */}
      {songsById && (
        <footer className="player">
          <div className="now-playing">
            <div className="now-cover">{cover(songsById)}</div>
            <div className="now-text">
              <strong>{songsById.title}</strong>
              <small>{songsById.artist}</small>
            </div>
          </div>

          <div className="player-center">
            <div className="player-buttons">
              <button className={`icon-btn optional ${shuffle ? 'toggled' : ''}`} onClick={() => setShuffle(s => !s)} title="Ordem aleatória">
                <Shuffle size={16}/>
              </button>
              <button className="icon-btn" onClick={() => move(-1)} disabled={!songs.length} aria-label="Faixa anterior">
                <SkipBack size={18}/>
              </button>
              <button className="play-main" onClick={() => setPlaying(p => !p)} disabled={!currentId} aria-label={playing ? 'Pausar' : 'Reproduzir'}>
                {playing ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}
              </button>
              <button className="icon-btn" onClick={() => move(1)} disabled={!songs.length} aria-label="Próxima faixa">
                <SkipForward size={18}/>
              </button>
              <button className={`icon-btn optional ${repeat ? 'toggled' : ''}`} onClick={() => setRepeat(s => !s)} title="Repetir">
                <Repeat2 size={16}/>
              </button>
            </div>
            <div className="seek">
              <span>{time(progress)}</span>
              <input type="range" min={0} max={duration || 1} step={0.1} value={Math.min(progress, duration || 1)} onChange={e => { const t = Number(e.target.value); if (audio.current) audio.current.currentTime = t; setProgress(t) }}/>
              <span>{time(duration)}</span>
            </div>
          </div>

          <div className="volume">
            <Volume2 size={17}/>
            <input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={e => setVolume(Number(e.target.value))}/>
          </div>
        </footer>
      )}

      {/* Toast Notification */}
      {notice && (
        <div className={`mc-toast ${notice.error ? 'mc-toast-error' : ''}`} role={notice.error ? 'alert' : 'status'}>
          {notice.error ? <AlertCircle size={18}/> : <CheckCircle2 size={18}/>}
          <span>{notice.text}</span>
          <button className="icon-btn" style={{ marginLeft: 'auto', width: '24px', height: '24px' }} onClick={() => setNotice(null)}>
            <X size={15}/>
          </button>
        </div>
      )}

      {/* Dialog System */}
      {dialog && (
        <div className="mc-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !savingDialog) setDialog(null) }}>
          <section className="mc-modal" role="dialog" aria-modal="true">
            <div className="mc-modal-header">
              <div className="mc-modal-symbol">
                {dialog.kind === 'createPlaylist' || dialog.kind === 'choosePlaylist' ? <ListMusic size={20}/> : dialog.kind === 'editSong' ? <Images size={20}/> : <Pencil size={20}/>}
              </div>
              <button className="icon-btn" onClick={() => setDialog(null)} disabled={savingDialog}>
                <X size={18}/>
              </button>
            </div>

            {dialog.kind === 'createPlaylist' && (
              <form onSubmit={createPlaylist}>
                <h2>Nova Playlist</h2>
                <p className="mc-modal-copy">Defina o nome da sua curadoria.</p>
                <label className="mc-field">
                  Nome da playlist
                  <input ref={dialogInput} value={draftPlaylist} onChange={e => setDraftPlaylist(e.target.value)} maxLength={80} placeholder="Ex.: Clássicos Acústicos" required />
                </label>
                <div className="mc-modal-actions">
                  <button type="button" className="secondary" onClick={() => setDialog(null)}>Cancelar</button>
                  <button className="primary" disabled={!draftPlaylist.trim()} type="submit">Criar</button>
                </div>
              </form>
            )}

            {dialog.kind === 'choosePlaylist' && (
              <div>
                <h2>Adicionar à Playlist</h2>
                <p className="mc-modal-copy">Escolha a playlist de destino para a música selecionada.</p>
                {playlists.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto', marginBottom: '16px' }}>
                    {playlists.map(p => (
                      <button key={p.id} className="secondary" style={{ justifyContent: 'space-between', padding: '12px 14px' }} onClick={() => confirmAddToPlaylist(p.id, dialog.songId)}>
                        <span>{p.name}</span>
                        <Plus size={16}/>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mc-modal-copy">Nenhuma playlist cadastrada.</p>
                )}
                <div className="mc-modal-actions">
                  <button className="secondary" onClick={() => setDialog(null)}>Fechar</button>
                </div>
              </div>
            )}

            {dialog.kind === 'editSong' && dialogSong && (
              <form onSubmit={e => void saveSongEdit(e)}>
                <h2>Editar Faixa</h2>
                <p className="mc-modal-copy">Modifique os metadados do arquivo.</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                  <div style={{ width: '64px', height: '64px', borderRadius: '8px', background: 'var(--bg-canvas)', border: '1px solid var(--border-muted)', overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
                    {!removeCover && (coverPreview || dialogSong.coverUrl) ? <img src={coverPreview || dialogSong.coverUrl} alt="Capa" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : <Music2 size={24}/>}
                  </div>
                  <div>
                    <label className="secondary" style={{ cursor: 'pointer', display: 'inline-flex', padding: '8px 12px' }}>
                      <ImagePlus size={14}/> Carregar capa
                      <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={e => { chooseNewCover(e.target.files?.[0]); e.target.value = '' }} />
                    </label>
                    {(!removeCover && (coverFile || dialogSong.coverUrl)) && (
                      <button type="button" className="text-button danger" style={{ display: 'block', marginTop: '6px' }} onClick={() => { setCoverFile(null); setCoverPreview(null); setRemoveCover(true) }}>
                        Remover capa
                      </button>
                    )}
                  </div>
                </div>
                <label className="mc-field">Título<input ref={dialogInput} value={draftTitle} onChange={e => setDraftTitle(e.target.value)} required /></label>
                <label className="mc-field">Artista<input value={draftArtist} onChange={e => setDraftArtist(e.target.value)} required /></label>
                <label className="mc-field">Álbum<input value={draftAlbum} onChange={e => setDraftAlbum(e.target.value)} /></label>
                <div className="mc-modal-actions">
                  <button type="button" className="secondary" disabled={savingDialog} onClick={() => setDialog(null)}>Cancelar</button>
                  <button type="submit" className="primary" disabled={savingDialog || !draftTitle.trim() || !draftArtist.trim()}>{savingDialog ? 'Salvando...' : 'Salvar'}</button>
                </div>
              </form>
            )}

            {dialog.kind === 'renameArtist' && (
              <form onSubmit={e => void saveArtistName(e)}>
                <h2>Renomear Artista</h2>
                <p className="mc-modal-copy">Atualiza o nome do artista em todas as faixas associadas.</p>
                <label className="mc-field">Nome do artista<input ref={dialogInput} value={draftArtist} onChange={e => setDraftArtist(e.target.value)} required /></label>
                <div className="mc-modal-actions">
                  <button type="button" className="secondary" disabled={savingDialog} onClick={() => setDialog(null)}>Cancelar</button>
                  <button className="primary" type="submit" disabled={savingDialog || !draftArtist.trim()}>{savingDialog ? 'Salvando...' : 'Atualizar'}</button>
                </div>
              </form>
            )}

            {dialog.kind === 'deletePlaylist' && (
              <div>
                <h2>Excluir Playlist?</h2>
                <p className="mc-modal-copy">A playlist “{dialogPlaylist?.name}” será removida. Os arquivos continuarão preservados na biblioteca.</p>
                <div className="mc-modal-actions">
                  <button className="secondary" onClick={() => setDialog(null)}>Cancelar</button>
                  <button className="mc-danger-button" onClick={() => deletePlaylistConfirmed(dialog.playlistId)}>Excluir</button>
                </div>
              </div>
            )}

            {dialog.kind === 'deleteSong' && dialogSong && (
              <div>
                <h2>Excluir Faixa?</h2>
                <p className="mc-modal-copy">“{dialogSong.title}” será apagada definitivamente do armazenamento local.</p>
                <div className="mc-modal-actions">
                  <button className="secondary" disabled={savingDialog} onClick={() => setDialog(null)}>Cancelar</button>
                  <button className="mc-danger-button" disabled={savingDialog} onClick={() => void removeSongConfirmed(dialog.songId)}>{savingDialog ? 'Excluindo...' : 'Confirmar exclusão'}</button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Hidden inputs & audio element */}
      <input ref={artistPhotoInput} className="hidden-input" type="file" accept="image/*" onChange={e => { void saveArtistPhoto(e.target.files?.[0]); e.target.value = '' }}/>
      <input ref={filesInput} className="hidden-input" type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac,.flac" multiple disabled={!ready || importing || !!storageError} onChange={e => { void importSongs(e.target.files); e.target.value = '' }}/>
      <audio 
        ref={audio} 
        src={songsById?.url} 
        preload="metadata" 
        onLoadedMetadata={e => { setDuration(e.currentTarget.duration || 0); if (playing) e.currentTarget.play().catch(() => setPlaying(false)) }} 
        onCanPlay={e => { if (playing && e.currentTarget.paused) e.currentTarget.play().catch(() => setPlaying(false)) }} 
        onTimeUpdate={e => setProgress(e.currentTarget.currentTime)} 
        onEnded={ended} 
        onError={() => { if (songsById) { setPlaying(false); setNotice({ text: 'Falha ao decodificar arquivo de áudio.', error: true }) } }}
      />
    </div>
  )
}
