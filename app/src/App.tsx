import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { parseBlob } from 'music-metadata'
import { 
  Home, Library, ListMusic, Upload, Search, Play, Pause, 
  SkipBack, SkipForward, Volume2, Music2, Plus, Trash2, 
  Disc3, Shuffle, Repeat2, UsersRound, ImagePlus, Pencil, Cloud, CloudUpload, CloudDownload, HardDriveDownload, ShieldCheck, 
  RefreshCw, X, CheckCircle2, AlertCircle, Images, ListOrdered, ChevronUp, ChevronDown, Maximize2 
} from 'lucide-react'
import './App.css'
import './redesign.css'
import './theme2.css'
import './editorial21.css'
import './musiccontrol30.css'
import './musiccontrol33.css'
import CinematicScene from './components/CinematicScene'
import CardFanCarousel from './components/ui/card-fan-carousel'
import './musiccontrol35.css'
import { useMusicControlAuth } from './AuthContext'
import { listCloudSongs, listCloudPlaylists, uploadSong, uploadPlaylists, downloadCloudSong } from './cloudSync'
import type { CloudSong, CloudPlaylist } from './cloudSync'
import './cloudLibrary.css'

type Song = { id: string; title: string; artist: string; album?: string; url: string; coverUrl?: string }
type Playlist = { id: string; name: string; songIds: string[] }
type Tab = 'home' | 'library' | 'playlists' | 'artists' | 'cloud'
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
let activeLibraryOwner = ''
function setLibraryOwner(userId: string) {
  if (activeLibraryOwner !== userId) {
    activeLibraryOwner = userId
    if (dbPromise) { void dbPromise.then(db => db.close()).catch(() => {}); dbPromise = null }
  }
}
let dbPromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('Este navegador não oferece suporte a IndexedDB.'))
        return
      }
      if (!activeLibraryOwner) { reject(new Error('Conta não identificada.')); return }
      const request = indexedDB.open(`${DB_NAME}:${activeLibraryOwner}`, DB_VERSION)
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

type PlaybackSnapshot = { songId: string | null; position: number; volume: number; wasPlaying: boolean }
const PLAYBACK_KEY = 'musiccontrol:playback:v1'
function loadPlayback(userId: string): PlaybackSnapshot | null {
  try {
    const raw = sessionStorage.getItem(`${PLAYBACK_KEY}:${userId}`)
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<PlaybackSnapshot>
    return {
      songId: typeof data.songId === 'string' ? data.songId : null,
      position: typeof data.position === 'number' && Number.isFinite(data.position) ? Math.max(0, data.position) : 0,
      volume: typeof data.volume === 'number' && Number.isFinite(data.volume) ? Math.max(0, Math.min(1, data.volume)) : 0.8,
      wasPlaying: data.wasPlaying === true,
    }
  } catch { return null }
}

const artistKey = (name: string) => name.trim().toLocaleLowerCase('pt-BR')
const time = (value: number) => Number.isFinite(value) ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}` : '0:00'

export default function App() {
  const { session } = useMusicControlAuth()
  const userId = session.user.id
  const [tab, setTab] = useState<Tab>('home')
  const [songs, setSongs] = useState<Song[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [queue, setQueue] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(`musiccontrol:queue:${userId}`) || '[]') as string[] } catch { return [] }
  })
  const [queueOpen, setQueueOpen] = useState(false)
  const [coverOpen, setCoverOpen] = useState(false)
  const queueRef = useRef<string[]>(queue)
  queueRef.current = queue
  useEffect(() => { localStorage.setItem(`musiccontrol:queue:${userId}`, JSON.stringify(queue)) }, [queue, userId])

  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(() => loadPlayback(userId)?.volume ?? 0.8)
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
  const [cloudSongs, setCloudSongs] = useState<CloudSong[]>([])
  const [cloudPlaylists, setCloudPlaylists] = useState<CloudPlaylist[]>([])
  const [cloudBusy, setCloudBusy] = useState(false)
  const [cloudLoading, setCloudLoading] = useState(false)
  const [cloudStatus, setCloudStatus] = useState('')
  const [cloudError, setCloudError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
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
  const playbackRestore = useRef(loadPlayback(userId))
  const pendingSeek = useRef<number | null>(playbackRestore.current?.position ?? null)
  const lastSnapshotWrite = useRef(0)
  const filesInput = useRef<HTMLInputElement>(null)
  const songsRef = useRef<Song[]>([])
  const songsById = songs.find(s => s.id === currentId)
  const activePlaylist = playlists.find(p => p.id === selectedPlaylist)
  const dialogSong = dialog && ('songId' in dialog) ? songs.find(s => s.id === dialog.songId) : undefined
  const dialogPlaylist = dialog?.kind === 'deletePlaylist' ? playlists.find(p => p.id === dialog.playlistId) : undefined
  const featuredCovers = songs.filter(song => Boolean(song.coverUrl)).slice(0, 14)
  const filtered = songs.filter(s => `${s.title} ${s.artist} ${s.album ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  const artists = Object.values(songs.reduce<Record<string, { name: string; count: number }>>((acc, song) => {
    const key = artistKey(song.artist)
    if (!acc[key]) acc[key] = { name: song.artist, count: 0 }
    acc[key].count++
    return acc
  }, {})).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  useEffect(() => {
    setLibraryOwner(userId)
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
        setArtistPhotos(prev => {
          for (const url of Object.values(prev)) URL.revokeObjectURL(url)
          return restoredPhotos
        })
        setSongs(prev => {
          for (const song of prev) { URL.revokeObjectURL(song.url); if (song.coverUrl) URL.revokeObjectURL(song.coverUrl) }
          return restored
        })
        setPlaylists(Array.isArray(savedPlaylists) ? savedPlaylists : [])
        const snapshot = playbackRestore.current
        if (snapshot?.songId && restored.some(s => s.id === snapshot.songId)) {
          setCurrentId(snapshot.songId)
          // Após recarregamento, o navegador pode exigir um novo clique para tocar.
          // Recuperamos a faixa e o tempo sem tentar contornar a política de autoplay.
          setPlaying(false)
          setProgress(snapshot.position)
        } else {
          pendingSeek.current = null
          setCurrentId(null)
        }
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
  }, [userId, reloadKey])

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

  // Controles nativos de mídia: tela bloqueada, notificações e teclas multimídia.
  // Os callbacks ficam em refs para não registrar handlers obsoletos.
  const mediaActions = useRef({ next: () => {}, previous: () => {} })
  mediaActions.current.next = () => move(1)
  mediaActions.current.previous = () => move(-1)

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const session = navigator.mediaSession
    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ['play', () => setPlaying(true)],
      ['pause', () => setPlaying(false)],
      ['stop', () => { setPlaying(false); if (audio.current) audio.current.currentTime = 0 }],
      ['nexttrack', () => mediaActions.current.next()],
      ['previoustrack', () => {
        if (audio.current && audio.current.currentTime > 3) audio.current.currentTime = 0
        else mediaActions.current.previous()
      }],
      ['seekto', details => {
        if (!audio.current || details.seekTime === undefined) return
        const length = audio.current.duration
        audio.current.currentTime = Math.max(0, Math.min(details.seekTime, Number.isFinite(length) ? length : details.seekTime))
      }],
      ['seekbackward', details => {
        if (audio.current) audio.current.currentTime = Math.max(0, audio.current.currentTime - (details.seekOffset || 10))
      }],
      ['seekforward', details => {
        if (audio.current) audio.current.currentTime = Math.min(audio.current.duration || Infinity, audio.current.currentTime + (details.seekOffset || 10))
      }],
    ]
    for (const [action, handler] of handlers) {
      try { session.setActionHandler(action, handler) } catch { /* ação não suportada neste navegador */ }
    }
    return () => {
      for (const [action] of handlers) {
        try { session.setActionHandler(action, null) } catch { /* navegador sem suporte */ }
      }
    }
  }, [])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const song = songsById
    navigator.mediaSession.metadata = song ? new MediaMetadata({
      title: song.title,
      artist: song.artist,
      album: song.album || 'MusicControl',
      artwork: song.coverUrl ? [{ src: song.coverUrl }] : [],
    }) : null
  }, [songsById?.id, songsById?.title, songsById?.artist, songsById?.album, songsById?.coverUrl])

  useEffect(() => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing && currentId ? 'playing' : 'paused'
  }, [playing, currentId])

  function updateMediaPosition(element: HTMLAudioElement) {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return
    if (!Number.isFinite(element.duration) || element.duration <= 0) return
    try {
      navigator.mediaSession.setPositionState({
        duration: element.duration,
        playbackRate: element.playbackRate,
        position: Math.max(0, Math.min(element.currentTime, element.duration)),
      })
    } catch { /* posição indisponível */ }
  }

  // Preserva a sessão em recarregamentos/HMR e em abas descartadas pelo navegador.
  // Não adiciona listeners de visibilitychange que pausariam o áudio ao trocar de aba.
  const playbackStateRef = useRef({ currentId, playing, volume })
  playbackStateRef.current = { currentId, playing, volume }
  function savePlaybackSnapshot(force = false) {
    const now = Date.now()
    if (!force && now - lastSnapshotWrite.current < 1500) return
    lastSnapshotWrite.current = now
    const state = playbackStateRef.current
    try {
      sessionStorage.setItem(`${PLAYBACK_KEY}:${userId}`, JSON.stringify({
        songId: state.currentId,
        position: audio.current?.currentTime ?? 0,
        volume: state.volume,
        wasPlaying: state.playing,
      } satisfies PlaybackSnapshot))
    } catch { /* armazenamento de sessão indisponível */ }
  }
  useEffect(() => { savePlaybackSnapshot(true) }, [currentId, playing, volume])
  useEffect(() => {
    const save = () => savePlaybackSnapshot(true)
    window.addEventListener('pagehide', save)
    return () => { save(); window.removeEventListener('pagehide', save) }
  }, [])
  function restoreAudioPosition(element: HTMLAudioElement) {
    const target = pendingSeek.current
    if (target === null || !Number.isFinite(element.duration) || element.duration <= 0) return
    element.currentTime = Math.min(target, Math.max(0, element.duration - 0.1))
    pendingSeek.current = null
    setProgress(element.currentTime)
  }

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

  async function refreshCloud(clearError = true) {
    setCloudLoading(true)
    if (clearError) setCloudError('')
    try {
      const [remoteSongs, remotePlaylists] = await Promise.all([
        listCloudSongs(userId), listCloudPlaylists(userId)
      ])
      setCloudSongs(remoteSongs)
      setCloudPlaylists(remotePlaylists)
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : 'Não foi possível acessar a nuvem.')
    } finally {
      setCloudLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'cloud') void refreshCloud()
  // A consulta é realizada ao entrar na aba Nuvem.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, userId])

  async function sendToCloud() {
    if (cloudBusy || !ready || storageError) return
    setCloudBusy(true)
    setCloudError('')
    let uploaded = 0
    try {
      const local = await getRecords<StoredSong>('songs')
      for (const [i, song] of local.entries()) {
        setCloudStatus(`Enviando música ${i + 1} de ${local.length}: ${song.title}`)
        await uploadSong(userId, song)
        uploaded++
      }
      setCloudStatus('Sincronizando playlists...')
      await uploadPlaylists(userId, playlists)
      setCloudStatus(`${uploaded} música(s) e ${playlists.length} playlist(s) enviadas. Seus arquivos locais foram preservados.`)
      await refreshCloud()
    } catch (error) {
      await refreshCloud(false)
      setCloudError(`${uploaded} faixa(s) enviada(s) antes da interrupção. ${error instanceof Error ? error.message : 'Erro inesperado.'}`)
    } finally { setCloudBusy(false) }
  }

  async function restoreFromCloud() {
    if (cloudBusy || !ready || storageError) return
    setCloudBusy(true)
    setCloudError('')
    let restored = 0
    try {
      const remote = await listCloudSongs(userId)
      const local = await getRecords<StoredSong>('songs')
      const known = new Set(local.map(s => s.id))
      const missing = remote.filter(song => !known.has(song.id))
      for (const [i, song] of missing.entries()) {
        setCloudStatus(`Baixando música ${i + 1} de ${missing.length}: ${song.title}`)
        const blobs = await downloadCloudSong(song)
        await putRecord('songs', {
          id: song.id, title: song.title, artist: song.artist,
          album: song.album || undefined, file: blobs.file, cover: blobs.cover,
          importedAt: Date.parse(song.imported_at) || Date.now()
        } satisfies StoredSong)
        restored++
      }
      const remotePlaylists = await listCloudPlaylists(userId)
      const localPlaylists = new Map(playlists.map(p => [p.id, p]))
      for (const p of remotePlaylists) if (!localPlaylists.has(p.id)) {
        localPlaylists.set(p.id, { id: p.id, name: p.name, songIds: p.song_ids })
      }
      await persistPlaylists(Array.from(localPlaylists.values()))
      setPlaylists(Array.from(localPlaylists.values()))
      if (restored) setReloadKey(v => v + 1)
      setCloudStatus(`${restored} música(s) nova(s) restaurada(s). ${remote.length - restored} já existiam neste navegador. Playlists locais preservadas.`)
      await refreshCloud()
    } catch (error) {
      if (restored) setReloadKey(v => v + 1)
      setCloudError(`${restored} música(s) restaurada(s) antes do erro. ${error instanceof Error ? error.message : 'Falha ao restaurar.'}`)
    } finally { setCloudBusy(false) }
  }

  async function migrateLegacyLibrary() {
    if (cloudBusy || !ready || storageError) return
    setCloudBusy(true)
    setCloudError('')
    try {
      // Migração opt-in para não expor a antiga biblioteca compartilhada entre contas.
      const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('Não foi possível abrir a biblioteca antiga.'))
      })
      const loadLegacy = <T,>(store: string) => new Promise<T[]>((resolve, reject) => {
        if (!legacy.objectStoreNames.contains(store)) { resolve([]); return }
        const request = legacy.transaction(store, 'readonly').objectStore(store).getAll()
        request.onsuccess = () => resolve(request.result as T[])
        request.onerror = () => reject(request.error ?? new Error('Falha ao importar os dados antigos.'))
      })
      const oldSongs = await loadLegacy<StoredSong>('songs')
      const settings = await loadLegacy<{ key: string; value: unknown }>('settings')
      legacy.close()
      if (!oldSongs.length && !settings.length) {
        setCloudStatus('Nenhuma biblioteca antiga foi encontrada neste navegador.')
        return
      }
      const currentSongs = await getRecords<StoredSong>('songs')
      const known = new Set(currentSongs.map(song => song.id))
      let count = 0
      for (const song of oldSongs) if (!known.has(song.id)) {
        await putRecord('songs', song)
        count++
      }
      for (const entry of settings) {
        if (entry.key === 'playlists') continue
        if (entry.key.startsWith('artist-photo:')) {
          const stored = await getRecord('settings', entry.key)
          if (!stored) await putRecord('settings', entry)
        }
      }
      const formerPlaylists = settings.find(s => s.key === 'playlists')?.value
      if (Array.isArray(formerPlaylists)) {
        const combined = new Map(playlists.map(p => [p.id, p]))
        for (const p of formerPlaylists as Playlist[]) if (!combined.has(p.id)) combined.set(p.id, p)
        await persistPlaylists(Array.from(combined.values()))
        setPlaylists(Array.from(combined.values()))
      }
      setReloadKey(v => v + 1)
      setCloudStatus(`${count} faixa(s) importada(s) da biblioteca antiga. Agora estão isoladas nesta conta.`)
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : 'Falha ao importar biblioteca antiga.')
    } finally { setCloudBusy(false) }
  }

  function cover(song: Song) {
    return song.coverUrl
      ? <img className="cover-photo" src={song.coverUrl} alt={song.title} />
      : <Music2 size={18}/>
  }

  function enqueue(id: string) {
    if (!songs.some(s => s.id === id)) return
    setQueue(q => [...q, id])
    setNotice({ text: 'Música adicionada à fila.' })
  }

  function reorderQueue(index: number, direction: number) {
    setQueue(q => {
      const target = index + direction
      if (target < 0 || target >= q.length) return q
      const next = [...q]; [next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function chooseSong(id: string) {
    if (id === currentId) { setPlaying(p => !p); return }
    pendingSeek.current = null; setProgress(0); setDuration(0); setCurrentId(id); setPlaying(true)
  }

  function move(direction: number) {
    if (direction > 0 && queueRef.current.length) {
      const nextId = queueRef.current.find(id => songs.some(s => s.id === id))
      setQueue(q => q.slice(nextId ? q.indexOf(nextId) + 1 : q.length))
      if (nextId) {
        pendingSeek.current = null; setProgress(0); setDuration(0); setCurrentId(nextId); setPlaying(true)
        return
      }
    }
    if (!songs.length) return
    const i = songs.findIndex(s => s.id === currentId)
    const next = shuffle && songs.length > 1 
      ? (i + 1 + Math.floor(Math.random() * (songs.length - 1))) % songs.length 
      : (i + direction + songs.length) % songs.length
    pendingSeek.current = null; setProgress(0); setDuration(0); setCurrentId(songs[next].id); setPlaying(true)
  }

  function ended() {
    if (repeat && audio.current && queueRef.current.length === 0) { audio.current.currentTime = 0; audio.current.play().catch(() => setPlaying(false)) }
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
          <button className="icon-btn" title="Adicionar à fila de reprodução" aria-label={`Adicionar ${song.title} à fila`} onClick={() => enqueue(song.id)}>
            <ListOrdered size={16}/>
          </button>
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
          <button className={tab === 'cloud' ? 'nav-active' : ''} onClick={() => setTab('cloud')}><Cloud size={18}/> <span>Nuvem</span></button>
        </nav>

        <div className="sidebar-bottom">
          <Disc3 size={16}/> MUSICCONTROL <span>3.4</span>
        </div>
      </aside>

      <main className="content">
        <div className="topbar">
          <span className="topbar-location">
            Coleção <span className="topbar-separator">/</span> 
            {tab === "home" ? "Início" : tab === "library" ? "Biblioteca" : tab === "artists" ? "Artistas" : tab === "cloud" ? "Nuvem" : "Playlists"}
          </span>
          <div id="mc-profile-slot" />
        </div>

        {storageError && <p className="muted" role="alert">{storageError}</p>}

        {tab === 'cloud' && (
          <section className="mc-cloud" aria-labelledby="mc-cloud-title">
            <div className="mc-cloud-heading">
              <div className="mc-cloud-icon"><Cloud size={28}/></div>
              <span className="mc-cloud-eyebrow">SUA MÚSICA, ONDE VOCÊ ESTIVER</span>
              <h1 id="mc-cloud-title">Sua biblioteca <em>na nuvem.</em></h1>
              <p>Sincronize suas faixas e playlists com segurança para recuperar tudo em outro dispositivo. O conteúdo permanece privado na sua conta.</p>
            </div>
            <div className="mc-cloud-metrics" aria-live="polite">
              <div><span>Biblioteca deste navegador</span><strong>{songs.length}</strong><small>faixas disponíveis offline</small></div>
              <div><span>Acervo na nuvem</span><strong>{cloudLoading ? '…' : cloudSongs.length}</strong><small>faixas salvas no Supabase</small></div>
              <div><span>Playlists na nuvem</span><strong>{cloudLoading ? '…' : cloudPlaylists.length}</strong><small>listas já sincronizadas</small></div>
            </div>
            <div className="mc-cloud-actions">
              <div className="mc-cloud-action">
                <div className="mc-cloud-action-icon"><CloudUpload size={22}/></div>
                <div><h2>Enviar biblioteca</h2><p>Faz uma cópia das músicas e playlists deste navegador no seu espaço privado do Supabase.</p></div>
                <button className="primary" disabled={cloudBusy || cloudLoading || !ready || !!storageError} onClick={() => void sendToCloud()}><CloudUpload size={17}/> {cloudBusy ? 'Sincronizando…' : 'Enviar para a nuvem'}</button>
              </div>
              <div className="mc-cloud-action">
                <div className="mc-cloud-action-icon"><CloudDownload size={22}/></div>
                <div><h2>Restaurar em outro dispositivo</h2><p>Baixa somente as faixas que ainda não estão neste navegador e recupera playlists ausentes.</p></div>
                <button className="secondary" disabled={cloudBusy || cloudLoading || !ready || !!storageError} onClick={() => void restoreFromCloud()}><CloudDownload size={17}/> Restaurar da nuvem</button>
              </div>
              <div className="mc-cloud-action mc-cloud-legacy">
                <div className="mc-cloud-action-icon"><HardDriveDownload size={22}/></div>
                <div><h2>Biblioteca da versão anterior</h2><p>Importe, se necessário, os arquivos que estavam salvos no navegador antes da separação das bibliotecas por conta. Faça isso apenas na sua conta.</p></div>
                <button className="secondary" disabled={cloudBusy || !ready || !!storageError} onClick={() => void migrateLegacyLibrary()}><HardDriveDownload size={17}/> Importar biblioteca antiga</button>
              </div>
            </div>
            {cloudStatus && <p role="status" className="mc-cloud-status"><CheckCircle2 size={18}/>{cloudStatus}</p>}
            {cloudError && <p role="alert" className="mc-cloud-error"><AlertCircle size={18}/>{cloudError}</p>}
            <div className="mc-cloud-footnote"><ShieldCheck size={18}/><span>Os downloads não substituem arquivos existentes, e o envio nunca apaga sua biblioteca local. Exclusões locais não removem arquivos da nuvem.</span></div>
            <button className="text-button" disabled={cloudLoading || cloudBusy} onClick={() => void refreshCloud()}><RefreshCw size={15}/> Atualizar informações da nuvem</button>
          </section>
        )}

        {tab === 'home' && (
          <>
            <section className="hero mc2-hero">
              <CinematicScene />
              <div className="hero-copy">
                <span className="hero-caption">MUSICCONTROL / EDIÇÃO 3.4</span>
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

            {featuredCovers.length > 0 && (
              <section className="mc35-feature" aria-label="Capas da sua coleção">
                <header className="mc35-feature-head">
                  <div>
                    <span className="mc35-feature-kicker">REDESCUBRA SUA COLEÇÃO</span>
                    <h2>Suas capas. <em>Seu som.</em></h2>
                    <p>Explore as músicas como um leque de capas. Escolha uma e deixe tocar.</p>
                  </div>
                  <button className="text-button" onClick={() => setTab('library')}>Abrir biblioteca →</button>
                </header>
                <CardFanCarousel
                  key={userId}
                  cards={featuredCovers.map(song => ({
                    imgUrl: song.coverUrl!,
                    alt: `Capa de ${song.title}`,
                    title: song.title,
                    subtitle: song.artist,
                  }))}
                  onCardClick={index => {
                    const song = featuredCovers[index]
                    if (song) chooseSong(song.id)
                  }}
                />
              </section>
            )}

            {songs.length > 0 && (
              <section className="mc3-quick" aria-label="Acesso rápido às suas músicas">
                <div className="section-head mc3-section-head">
                  <div><span className="mc3-kicker">SUA FREQUÊNCIA</span><h2>Entre no seu som<span className="mc3-dot">.</span></h2></div>
                  <button className="text-button" onClick={() => setTab('library')}>Explorar biblioteca →</button>
                </div>
                <div className="mc3-quick-grid">
                  {songs.slice(0, 4).map((song, i) => (
                    <button key={song.id} className="mc3-quick-card" onClick={() => chooseSong(song.id)} aria-label={`Reproduzir ${song.title}`}>
                      <div className="mc3-quick-cover">{cover(song)}<span className="mc3-quick-play"><Play size={20} fill="currentColor"/></span></div>
                      <div className="mc3-quick-meta"><span className="mc3-quick-number">0{i + 1} / NA SUA COLEÇÃO</span><strong>{song.title}</strong><small>{song.artist}</small></div>
                    </button>
                  ))}
                </div>
              </section>
            )}

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
            <button className="now-cover mc-cover-trigger" title="Ampliar capa" aria-label="Ver capa ampliada" onClick={() => setCoverOpen(true)}>{cover(songsById)}<Maximize2 size={12} className="mc-cover-expand"/></button>
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

          <button className="icon-btn mc-queue-toggle" title="Abrir fila" aria-label="Abrir fila de reprodução" onClick={() => setQueueOpen(true)}>
            <ListOrdered size={20}/><span>{queue.length}</span>
          </button>
          <div className="volume">
            <Volume2 size={17}/>
            <input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={e => setVolume(Number(e.target.value))}/>
          </div>
        </footer>
      )}

      {queueOpen && <div className="mc-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setQueueOpen(false) }}>
        <section className="mc-queue-panel" role="dialog" aria-modal="true" aria-label="Fila de reprodução">
          <header><h2>Fila de reprodução</h2><button className="icon-btn" onClick={() => setQueueOpen(false)} aria-label="Fechar fila"><X/></button></header>
          <p>Adicione músicas de qualquer área e mude a sequência usando as setas.</p>
          {songsById && <div className="mc-queue-now"><strong>Tocando agora</strong><span>{songsById.title} — {songsById.artist}</span></div>}
          {queue.length === 0 ? <p>Nenhuma música na fila. Use o botão de fila ao lado de qualquer faixa.</p> :
            <div className="mc-queue-items">{queue.map((id, index) => {
              const song = songs.find(s => s.id === id)
              return <div className="mc-queue-item" key={`${id}-${index}`}>
                <span>{index + 1}.</span><div className="mc-queue-info"><strong>{song?.title || 'Música indisponível'}</strong><small>{song?.artist}</small></div>
                <button className="icon-btn" disabled={index === 0} onClick={() => reorderQueue(index, -1)} aria-label="Subir na fila"><ChevronUp size={18}/></button>
                <button className="icon-btn" disabled={index === queue.length - 1} onClick={() => reorderQueue(index, 1)} aria-label="Descer na fila"><ChevronDown size={18}/></button>
                <button className="icon-btn" onClick={() => setQueue(q => q.filter((_, i) => i !== index))} aria-label="Remover da fila"><X size={18}/></button>
              </div>
            })}</div>}
          <button className="secondary" onClick={() => setQueue([])}>Limpar fila</button>
        </section>
      </div>}
      {coverOpen && songsById && <div className="mc-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setCoverOpen(false) }}>
        <section className="mc-artwork-modal" role="dialog" aria-modal="true" aria-label="Capa da música">
          <button className="icon-btn mc-artwork-close" onClick={() => setCoverOpen(false)} aria-label="Fechar capa"><X/></button>
          {songsById.coverUrl ? <img src={songsById.coverUrl} alt={`Capa de ${songsById.title}`}/> : <div className="mc-artwork-empty"><Music2 size={70}/></div>}
          <strong>{songsById.title}</strong><span>{songsById.artist}</span>
        </section>
      </div>}
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
        preload="auto"
        playsInline 
        onLoadedMetadata={e => { restoreAudioPosition(e.currentTarget); setDuration(e.currentTarget.duration || 0); updateMediaPosition(e.currentTarget); if (playing) e.currentTarget.play().catch(() => setPlaying(false)) }} 
        onCanPlay={e => { if (playing && e.currentTarget.paused) e.currentTarget.play().catch(() => setPlaying(false)) }} 
        onTimeUpdate={e => { setProgress(e.currentTarget.currentTime); updateMediaPosition(e.currentTarget); savePlaybackSnapshot() }} 
        onEnded={ended} 
        onError={() => { if (songsById) { setPlaying(false); setNotice({ text: 'Falha ao decodificar arquivo de áudio.', error: true }) } }}
      />
    </div>
  )
}
