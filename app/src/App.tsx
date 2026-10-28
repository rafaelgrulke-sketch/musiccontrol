import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { parseBlob } from 'music-metadata'
import { Home, Library, ListMusic, Upload, Search, Play, Pause, SkipBack, SkipForward, Volume2, Music2, Plus, Trash2, Disc3, Clock3, Shuffle, Repeat2, UsersRound, ImagePlus, Pencil, RefreshCw, X, CheckCircle2, AlertCircle, Images } from 'lucide-react'
import './App.css'

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


// Os arquivos de áudio ficam no IndexedDB deste navegador (não na nuvem).
type StoredSong = { id: string; title: string; artist: string; album?: string; cover?: Blob; file: Blob; importedAt: number }
const DB_NAME = 'musiccontrol-library'
const DB_VERSION = 1
let dbPromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('Este navegador não oferece IndexedDB.'))
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
      request.onblocked = () => reject(new Error('Feche outras abas do MusicControl e tente novamente.'))
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
    request.onerror = () => reject(request.error ?? new Error('Erro na leitura dos dados.'))
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
    tx.onerror = () => reject(tx.error ?? new Error('Erro ao excluir a música.'))
    tx.onabort = () => reject(tx.error ?? new Error('Exclusão cancelada.'))
    tx.objectStore(storeName).delete(id)
  })
}

let playlistQueue: Promise<void> = Promise.resolve()
function persistPlaylists(playlists: Playlist[]): Promise<void> {
  // Serializa gravações para alterações rápidas não restaurarem uma versão antiga.
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
        setCurrentId(restored[0]?.id ?? null)
      } catch (error) {
        if (!cancelled) {
          console.error('Erro ao abrir biblioteca local:', error)
          setStorageError('Não foi possível abrir o armazenamento local. Verifique as permissões e o espaço disponível no navegador.')
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
      setStorageError('Não foi possível salvar as playlists. Verifique o espaço do navegador.')
    })
  }, [playlists, ready, storageError])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(null), 4500)
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
      // Impede salvar imagens gigantes embutidas no áudio.
      const cover = picture && picture.data.byteLength <= 10 * 1024 * 1024
        ? new Blob([new Uint8Array(picture.data)], { type: picture.format || 'image/jpeg' })
        : undefined
      return {
        title: metadata.common.title?.trim() || fallback.title,
        artist: metadata.common.artist?.trim() || fallback.artist,
        album: metadata.common.album?.trim() || undefined,
        cover
      }
    } catch (error) {
      console.info('Este áudio não possui metadados legíveis:', filename, error)
      return fallback
    }
  }

  async function importSongs(files: FileList | null) {
    if (!files?.length || importing) return
    if (!ready || storageError) {
      setNotice({ text: 'A biblioteca local ainda não está pronta. Recarregue a página.', error: true })
      return
    }
    const accepted = Array.from(files).filter(f =>
      f.type.startsWith('audio/') || /\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(f.name)
    )
    if (!accepted.length) {
      setNotice({ text: 'Selecione arquivos de áudio válidos, como MP3.', error: true })
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
          // Salva o arquivo real, não a URL temporária blob:.
          await putRecord('songs', {
            id, ...tags, file, importedAt: Date.now()
          } satisfies StoredSong)
          added.push({ id, title: tags.title, artist: tags.artist, album: tags.album, url: URL.createObjectURL(file), coverUrl: tags.cover ? URL.createObjectURL(tags.cover) : undefined })
        } catch (error) {
          failures++
          console.error(`Não foi possível salvar ${file.name}:`, error)
        }
      }
      if (added.length) {
        setNotice({ text: `${added.length} música(s) adicionada(s) à sua biblioteca.` })
        setSongs(prev => [...prev, ...added])
        if (!currentId) setCurrentId(added[0].id)
        setTab('library')
      }
      if (failures) {
        setNotice({ text: `${added.length} música(s) salva(s); ${failures} não puderam ser salvas. Verifique o espaço do navegador.`, error: true })
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
      }, 1000)
      setDialog(null)
      setNotice({ text: `“${target.title}” foi removida da biblioteca.` })
    } catch (error) {
      console.error('Erro ao excluir música:', error)
      setNotice({ text: 'Não foi possível excluir a música do armazenamento local.', error: true })
    } finally { setSavingDialog(false) }
  }

  async function rescanMetadata() {
    if (scanning || !ready) return
    setScanning(true)
    let updated = 0
    try {
      const stored = await getRecords<StoredSong>('songs')
      for (const old of stored) {
        // Mantém as edições manuais: só preenche dados ausentes ou desconhecidos.
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
          if (newCoverUrl !== s.coverUrl && s.coverUrl) window.setTimeout(() => URL.revokeObjectURL(s.coverUrl!), 1000)
          return { ...s, artist: revised.artist, album: revised.album, coverUrl: newCoverUrl }
        }))
        updated++
      }
      setNotice({ text: updated ? `${updated} música(s) atualizada(s) com metadados e capas.` : 'Nenhuma informação nova encontrada nos arquivos.' })
    } catch (error) {
      console.error('Erro ao revisar metadados:', error)
      setNotice({ text: 'Não foi possível concluir a leitura das capas. Tente novamente.', error: true })
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
      setNotice({ text: 'Selecione uma imagem JPG, PNG ou WebP.', error: true }); return
    }
    if (file.size > 5 * 1024 * 1024) {
      setNotice({ text: 'A capa deve ter no máximo 5 MB.', error: true }); return
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
      if (!stored) throw new Error('Música não encontrada na biblioteca.')
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
      if (oldUrl && oldUrl !== newUrl) window.setTimeout(() => URL.revokeObjectURL(oldUrl), 1000)
      setDialog(null)
      setNotice({ text: 'Informações e capa da música atualizadas!' })
    } catch (error) {
      console.error('Erro ao salvar música:', error)
      setNotice({ text: 'Não foi possível salvar as alterações da música.', error: true })
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
      setNotice({ text: `Nome atualizado em ${targets.length} música(s).` })
    } catch (error) {
      console.error('Erro ao renomear artista:', error)
      setNotice({ text: 'Não foi possível renomear todas as músicas do artista.', error: true })
    } finally { setSavingDialog(false) }
  }

  function chooseArtistPhoto(artist: string) {
    photoArtist.current = artist
    artistPhotoInput.current?.click()
  }

  async function saveArtistPhoto(file: File | undefined) {
    const key = artistKey(photoArtist.current)
    if (!file || !key) return
    if (!file.type.startsWith('image/')) { setNotice({ text: 'Selecione uma imagem válida.', error: true }); return }
    if (file.size > 5 * 1024 * 1024) { setNotice({ text: 'A imagem deve ter até 5 MB.', error: true }); return }
    try {
      await putRecord('settings', { key: `artist-photo:${key}`, value: file })
      const url = URL.createObjectURL(file)
      const oldUrl = photosRef.current[key]
      setArtistPhotos(prev => ({ ...prev, [key]: url }))
      if (oldUrl) window.setTimeout(() => URL.revokeObjectURL(oldUrl), 1000)
      setNotice({ text: 'Foto do artista salva com sucesso.' })
    } catch (error) {
      console.error('Erro ao salvar foto do artista:', error)
      setNotice({ text: 'Não foi possível salvar a foto no navegador.', error: true })
    }
  }

  function cover(song: Song, size: 'small' | 'large' = 'small') {
    return song.coverUrl
      ? <img className={`cover-photo ${size}`} src={song.coverUrl} alt={`Capa de ${song.title}`} />
      : <Music2 size={size === 'large' ? 24 : 20}/>
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
  function addPlaylist(songId?: string) {
    setDraftPlaylist('')
    setDialog({ kind: 'createPlaylist', songId })
  }

  function createPlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = draftPlaylist.trim()
    if (!name || savingDialog) return
    if (playlists.some(playlist => playlist.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) {
      setNotice({ text: 'Já existe uma playlist com esse nome.', error: true })
      return
    }
    const id = crypto.randomUUID()
    const songIds = dialog?.kind === 'createPlaylist' && dialog.songId ? [dialog.songId] : []
    setPlaylists(prev => [...prev, { id, name, songIds }])
    setSelectedPlaylist(id)
    setTab('playlists')
    setDialog(null)
    setNotice({ text: `Playlist “${name}” criada com sucesso!` })
  }

  function addToPlaylist(songId: string) {
    setDialog({ kind: 'choosePlaylist', songId })
  }

  function confirmAddToPlaylist(playlistId: string, songId: string) {
    const selected = playlists.find(p => p.id === playlistId)
    if (!selected) return
    const alreadyAdded = selected.songIds.includes(songId)
    if (!alreadyAdded) {
      setPlaylists(prev => prev.map(p => p.id === playlistId
        ? { ...p, songIds: [...p.songIds, songId] }
        : p))
    }
    setDialog(null)
    setNotice({ text: alreadyAdded ? 'Essa música já está na playlist.' : `Música adicionada à playlist “${selected.name}”.` })
  }

  function deletePlaylistConfirmed(id: string) {
    const target = playlists.find(p => p.id === id)
    setPlaylists(prev => prev.filter(p => p.id !== id))
    if (selectedPlaylist === id) setSelectedPlaylist(null)
    setDialog(null)
    setNotice({ text: target ? `Playlist “${target.name}” excluída. Suas músicas foram mantidas.` : 'Playlist excluída.' })
  }

  function songRow(song: Song, index: number, inPlaylist = false) {
    return <div className={`track ${currentId === song.id ? 'active-track' : ''}`} key={song.id}>
      <span className="track-index">{index + 1}</span>
      <button className="track-cover" onClick={() => chooseSong(song.id)} aria-label={`Reproduzir ${song.title}`}>{cover(song)}</button>
      <button className="track-title" onClick={() => chooseSong(song.id)}><strong>{song.title}</strong><small>{song.artist}{song.album ? ` · ${song.album}` : ''}</small></button>
      <button className="icon-btn track-play" onClick={() => chooseSong(song.id)} aria-label="Reproduzir ou pausar">{currentId === song.id && playing ? <Pause size={18}/> : <Play size={18}/>}</button>
      <button className="icon-btn" title="Editar título, artista, álbum e capa" aria-label={`Editar ${song.title}`} onClick={() => openEditSong(song)}><Pencil size={16}/></button>
      {inPlaylist ? <button className="icon-btn" title="Remover da playlist" onClick={() => setPlaylists(prev => prev.map(p => p.id === selectedPlaylist ? {...p, songIds: p.songIds.filter(id => id !== song.id)} : p))}><Trash2 size={17}/></button> : <>
        <button className="icon-btn" title="Adicionar a uma playlist" onClick={() => addToPlaylist(song.id)}><Plus size={18}/></button>
        <button className="icon-btn" title="Excluir música do navegador" aria-label={`Excluir ${song.title}`} onClick={() => setDialog({ kind: 'deleteSong', songId: song.id })}><Trash2 size={17}/></button>
      </>}
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
        <button className={tab === 'artists' ? 'nav-active' : ''} onClick={() => setTab('artists')}><UsersRound size={20}/> Artistas</button>
      </nav>
      <div className="sidebar-bottom"><Disc3 size={18}/> Sua música. Seu espaço.</div>
    </aside>

    <main className="content">
      <div className="topbar"><span className="eyebrow">SUA EXPERIÊNCIA MUSICAL</span><span className="avatar">MC</span></div>
      {!ready && <p className="muted" role="status">Carregando músicas salvas neste navegador...</p>}
      {storageError && <p className="muted" role="alert">{storageError}</p>}
      {tab === 'home' && <>
        <section className="hero"><div><div className="eyebrow">BEM-VINDO AO MUSICCONTROL</div><h1>O som da sua<br/><em>liberdade.</em></h1><p>Organize suas músicas favoritas e curta cada momento do seu jeito.</p><button className="primary" disabled={!ready || importing || !!storageError} onClick={() => filesInput.current?.click()}><Upload size={18}/> {importing ? 'Salvando músicas...' : 'Importar músicas'}</button></div><div className="hero-art"><Disc3 size={148} strokeWidth={1}/></div></section>
        <div className="stats"><div className="stat"><Music2 size={22}/><strong>{songs.length}</strong><span>Músicas na biblioteca</span></div><div className="stat"><ListMusic size={22}/><strong>{playlists.length}</strong><span>Playlists criadas</span></div><div className="stat"><Clock3 size={22}/><strong>{currentId ? '1' : '0'}</strong><span>Faixa selecionada</span></div></div>
        {artists.length > 0 && <><div className="section-head"><h2>Seus artistas</h2><button className="text-button" onClick={() => setTab('artists')}>Ver artistas →</button></div><div className="artist-grid">{artists.slice(0, 5).map(artist => <button key={artistKey(artist.name)} className="artist-card" onClick={() => setTab('artists')}><div className="artist-avatar">{artistPhotos[artistKey(artist.name)] ? <img src={artistPhotos[artistKey(artist.name)]} alt={artist.name}/> : <UsersRound size={30}/>}</div><strong>{artist.name}</strong><small>{artist.count} música(s)</small></button>)}</div></>}
        <div className="section-head"><h2>Suas músicas</h2><button className="text-button" onClick={() => setTab('library')}>Ver biblioteca →</button></div>
        {songs.length ? <div className="tracks">{songs.slice(0, 6).map((s, i) => songRow(s, i))}</div> : <div className="empty"><Music2 size={38}/><h3>Comece sua coleção</h3><p>Importe seus arquivos MP3 para ouvir no MusicControl.</p><button className="secondary" disabled={!ready || importing || !!storageError} onClick={() => filesInput.current?.click()}><Plus size={17}/> Adicionar músicas</button></div>}
      </>}
      {tab === 'library' && <>
        <div className="page-head"><div><div className="eyebrow">SUA COLEÇÃO</div><h1>Biblioteca</h1><p>Explore e reproduza suas músicas.</p></div><button className="primary" disabled={!ready || importing || !!storageError} onClick={() => filesInput.current?.click()}><Upload size={18}/> {importing ? 'Salvando músicas...' : 'Adicionar músicas'}</button></div>
        <div className="library-toolbar"><div className="search"><Search size={19}/><input placeholder="Pesquisar músicas..." value={search} onChange={e => setSearch(e.target.value)}/></div><span>{filtered.length} música(s)</span></div>
        {filtered.length ? <div className="tracks">{filtered.map((s, i) => songRow(s, i))}</div> : <div className="empty"><Library size={38}/><h3>{songs.length ? 'Nenhum resultado' : 'Sua biblioteca está vazia'}</h3><p>{songs.length ? 'Tente outra pesquisa.' : 'Adicione músicas para começar.'}</p></div>}
      </>}
      {tab === 'artists' && <>
        <div className="page-head"><div><div className="eyebrow">SUA COLEÇÃO</div><h1>Artistas</h1><p>Músicas agrupadas automaticamente pelo nome do artista.</p></div><button className="secondary" onClick={() => void rescanMetadata()} disabled={scanning || !ready}><RefreshCw size={18}/>{scanning ? 'Lendo músicas...' : 'Ler capas e artistas dos MP3 salvos'}</button></div>
        {!artists.length ? <div className="empty"><UsersRound size={38}/><h3>Nenhum artista ainda</h3><p>Importe músicas para começar a organizar seus artistas.</p></div> : <div className="artist-list">{artists.map(artist => {
          const artistSongs = songs.filter(s => artistKey(s.artist) === artistKey(artist.name))
          const photoUrl = artistPhotos[artistKey(artist.name)]
          return <section className="artist-section" key={artistKey(artist.name)}>
            <div className="artist-heading"><div className="artist-avatar">{photoUrl ? <img src={photoUrl} alt={artist.name}/> : <UsersRound size={32}/>}</div><div className="artist-heading-text"><h2>{artist.name}</h2><span>{artist.count} música(s) na biblioteca</span></div><button className="secondary photo-button" onClick={() => openRenameArtist(artist.name)}><Pencil size={17}/>Renomear artista</button><button className="secondary photo-button" onClick={() => chooseArtistPhoto(artist.name)}><ImagePlus size={17}/>{photoUrl ? 'Trocar foto' : 'Adicionar foto'}</button></div>
            <div className="tracks">{artistSongs.map((song, index) => songRow(song, index))}</div>
          </section>
        })}</div>}
        <p className="muted">As fotos dos artistas são adicionadas por você e ficam armazenadas somente neste navegador. Se algum artista estiver incorreto, clique no lápis ao lado da música para editar o nome e a capa, ou use Renomear artista para corrigir todas as faixas.</p>
      </>}
      {tab === 'playlists' && <>
        <div className="page-head"><div><div className="eyebrow">ORGANIZE SEU SOM</div><h1>Playlists</h1><p>Crie coleções para cada momento.</p></div><button className="primary" onClick={() => addPlaylist()}><Plus size={18}/> Nova playlist</button></div>
        {!playlists.length ? <div className="empty"><ListMusic size={38}/><h3>Suas playlists começam aqui</h3><p>Crie sua primeira playlist para organizar suas músicas.</p><button className="secondary" onClick={() => addPlaylist()}><Plus size={17}/> Criar playlist</button></div> : <><div className="playlist-grid">{playlists.map(p => <button key={p.id} className={`playlist-card ${selectedPlaylist === p.id ? 'playlist-selected' : ''}`} onClick={() => setSelectedPlaylist(p.id)}><div className="playlist-art"><ListMusic size={33}/></div><strong>{p.name}</strong><small>{p.songIds.length} música(s)</small></button>)}</div>{activePlaylist && <section className="playlist-details"><div className="section-head"><h2>{activePlaylist.name}</h2><button className="text-button danger" onClick={() => setDialog({ kind: 'deletePlaylist', playlistId: activePlaylist.id })}><Trash2 size={16}/> Excluir playlist</button></div>{activePlaylist.songIds.length ? <div className="tracks">{activePlaylist.songIds.map(id => songs.find(s => s.id === id)).filter((s): s is Song => !!s).map((s, i) => songRow(s, i, true))}</div> : <p className="muted">Playlist vazia. Vá à Biblioteca e clique em + ao lado de uma música para adicioná-la.</p>}</section>}</>}
      </>}
    </main>

    <footer className="player"><div className="now-playing"><div className="now-cover">{songsById ? cover(songsById, 'large') : <Music2 size={24}/>}</div><div className="now-text"><strong>{songsById?.title ?? 'Escolha uma música'}</strong><small>{songsById?.artist ?? 'MusicControl'}</small></div></div><div className="player-center"><div className="player-buttons"><button className={`icon-btn optional ${shuffle ? 'toggled' : ''}`} onClick={() => setShuffle(s => !s)} title="Aleatório"><Shuffle size={17}/></button><button className="icon-btn" onClick={() => move(-1)} disabled={!songs.length} aria-label="Anterior"><SkipBack size={21}/></button><button className="play-main" onClick={() => setPlaying(p => !p)} disabled={!currentId} aria-label={playing ? 'Pausar' : 'Reproduzir'}>{playing ? <Pause size={21} fill="currentColor"/> : <Play size={21} fill="currentColor"/>}</button><button className="icon-btn" onClick={() => move(1)} disabled={!songs.length} aria-label="Próxima"><SkipForward size={21}/></button><button className={`icon-btn optional ${repeat ? 'toggled' : ''}`} onClick={() => setRepeat(s => !s)} title="Repetir faixa"><Repeat2 size={17}/></button></div><div className="seek"><span>{time(progress)}</span><input type="range" min={0} max={duration || 1} step={0.1} value={Math.min(progress, duration || 1)} onChange={e => { const t = Number(e.target.value); if (audio.current) audio.current.currentTime = t; setProgress(t) }}/><span>{time(duration)}</span></div></div><div className="volume"><Volume2 size={19}/><input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={e => setVolume(Number(e.target.value))}/></div></footer>
    {notice && <div className={`mc-toast ${notice.error ? 'mc-toast-error' : ''}`} role={notice.error ? 'alert' : 'status'}>
      {notice.error ? <AlertCircle size={20}/> : <CheckCircle2 size={20}/>}
      <span>{notice.text}</span>
      <button className="modal-icon" aria-label="Fechar aviso" onClick={() => setNotice(null)}><X size={18}/></button>
    </div>}

    {dialog && <div className="mc-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !savingDialog) setDialog(null) }}>
      <section className="mc-modal" role="dialog" aria-modal="true" aria-labelledby="mc-modal-title">
        <div className="mc-modal-header">
          <div className="mc-modal-symbol">{dialog.kind === 'createPlaylist' || dialog.kind === 'choosePlaylist' ? <ListMusic size={23}/> : dialog.kind === 'editSong' ? <Images size={23}/> : <Pencil size={23}/>}</div>
          <button className="modal-icon" aria-label="Fechar janela" disabled={savingDialog} onClick={() => setDialog(null)}><X size={21}/></button>
        </div>

        {dialog.kind === 'createPlaylist' && <form onSubmit={createPlaylist}>
          <h2 id="mc-modal-title">Criar nova playlist</h2>
          <p className="mc-modal-copy">Dê um nome à sua coleção de músicas.</p>
          <label className="mc-field">Nome da playlist
            <input ref={dialogInput} value={draftPlaylist} onChange={event => setDraftPlaylist(event.target.value)} maxLength={80} placeholder="Ex.: Minhas favoritas" required />
          </label>
          <div className="mc-modal-actions"><button type="button" className="secondary" onClick={() => setDialog(null)}>Cancelar</button><button className="primary" disabled={!draftPlaylist.trim()} type="submit"><Plus size={17}/>Criar playlist</button></div>
        </form>}

        {dialog.kind === 'choosePlaylist' && <div>
          <h2 id="mc-modal-title">Adicionar à playlist</h2>
          <p className="mc-modal-copy">Selecione onde deseja colocar esta música.</p>
          {playlists.length > 0 && <div className="mc-playlist-choices">{playlists.map(p => <button key={p.id} className="mc-playlist-choice" onClick={() => confirmAddToPlaylist(p.id, dialog.songId)}><div className="mc-playlist-choice-icon"><ListMusic size={20}/></div><span><strong>{p.name}</strong><small>{p.songIds.length} música(s)</small></span><Plus size={19}/></button>)}</div>}
          {!playlists.length && <p className="mc-modal-copy">Você ainda não tem playlists.</p>}
          <button className="mc-new-playlist" onClick={() => addPlaylist(dialog.songId)}><Plus size={18}/>Criar uma nova playlist</button>
          <div className="mc-modal-actions"><button className="secondary" onClick={() => setDialog(null)}>Fechar</button></div>
        </div>}

        {dialog.kind === 'editSong' && dialogSong && <form onSubmit={event => void saveSongEdit(event)}>
          <h2 id="mc-modal-title">Editar música</h2>
          <p className="mc-modal-copy">Altere o nome, o artista, o álbum e a capa desta faixa.</p>
          <div className="mc-cover-editor">
            <div className="mc-edit-cover">{!removeCover && (coverPreview || dialogSong.coverUrl) ? <img src={coverPreview || dialogSong.coverUrl} alt="Prévia da capa"/> : <Music2 size={38}/>}</div>
            <div className="mc-cover-tools">
              <label className="secondary mc-file-label"><ImagePlus size={17}/> Escolher capa
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { chooseNewCover(event.target.files?.[0]); event.target.value = '' }} />
              </label>
              {(!removeCover && (coverFile || dialogSong.coverUrl)) && <button type="button" className="text-button danger" onClick={() => { setCoverFile(null); setCoverPreview(null); setRemoveCover(true) }}>Remover capa</button>}
              <small>JPG, PNG ou WebP • até 5 MB</small>
            </div>
          </div>
          <label className="mc-field">Nome da música<input ref={dialogInput} value={draftTitle} onChange={event => setDraftTitle(event.target.value)} maxLength={200} required /></label>
          <label className="mc-field">Nome do artista<input value={draftArtist} onChange={event => setDraftArtist(event.target.value)} maxLength={160} required /></label>
          <label className="mc-field">Álbum (opcional)<input value={draftAlbum} onChange={event => setDraftAlbum(event.target.value)} maxLength={160} /></label>
          <div className="mc-modal-actions"><button type="button" className="secondary" disabled={savingDialog} onClick={() => setDialog(null)}>Cancelar</button><button type="submit" className="primary" disabled={savingDialog || !draftTitle.trim() || !draftArtist.trim()}>{savingDialog ? 'Salvando...' : 'Salvar alterações'}</button></div>
        </form>}

        {dialog.kind === 'renameArtist' && <form onSubmit={event => void saveArtistName(event)}>
          <h2 id="mc-modal-title">Renomear artista</h2>
          <p className="mc-modal-copy">O novo nome será aplicado a todas as músicas de “{dialog.artist}”.</p>
          <label className="mc-field">Novo nome do artista<input ref={dialogInput} value={draftArtist} onChange={event => setDraftArtist(event.target.value)} maxLength={160} required /></label>
          <div className="mc-modal-actions"><button type="button" className="secondary" disabled={savingDialog} onClick={() => setDialog(null)}>Cancelar</button><button className="primary" type="submit" disabled={savingDialog || !draftArtist.trim()}>{savingDialog ? 'Salvando...' : 'Salvar nome'}</button></div>
        </form>}

        {dialog.kind === 'deletePlaylist' && <div>
          <h2 id="mc-modal-title">Excluir playlist?</h2>
          <p className="mc-modal-copy">A playlist “{dialogPlaylist?.name}” será removida, mas suas músicas continuarão na biblioteca.</p>
          <div className="mc-modal-actions"><button className="secondary" onClick={() => setDialog(null)}>Cancelar</button><button className="mc-danger-button" onClick={() => deletePlaylistConfirmed(dialog.playlistId)}><Trash2 size={17}/>Excluir playlist</button></div>
        </div>}

        {dialog.kind === 'deleteSong' && dialogSong && <div>
          <h2 id="mc-modal-title">Excluir música?</h2>
          <p className="mc-modal-copy">“{dialogSong.title}” será removida do armazenamento local e das playlists. Esta ação não pode ser desfeita.</p>
          <div className="mc-modal-actions"><button className="secondary" disabled={savingDialog} onClick={() => setDialog(null)}>Cancelar</button><button className="mc-danger-button" disabled={savingDialog} onClick={() => void removeSongConfirmed(dialog.songId)}><Trash2 size={17}/>{savingDialog ? 'Excluindo...' : 'Excluir música'}</button></div>
        </div>}
      </section>
    </div>}

    <input ref={artistPhotoInput} className="hidden-input" type="file" accept="image/*" onChange={e => { void saveArtistPhoto(e.target.files?.[0]); e.target.value = '' }}/>
    <input ref={filesInput} className="hidden-input" type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac,.flac" multiple disabled={!ready || importing || !!storageError} onChange={e => { void importSongs(e.target.files); e.target.value = '' }}/>
    <audio ref={audio} src={songsById?.url} preload="metadata" onLoadedMetadata={e => { setDuration(e.currentTarget.duration || 0); if (playing) e.currentTarget.play().catch(() => setPlaying(false)) }} onCanPlay={e => { if (playing && e.currentTarget.paused) e.currentTarget.play().catch(() => setPlaying(false)) }} onTimeUpdate={e => setProgress(e.currentTarget.currentTime)} onEnded={ended} onError={() => { if (songsById) { setPlaying(false); setNotice({ text: 'Não foi possível reproduzir este arquivo. Tente um MP3 compatível.', error: true }) } }}/>
  </div>
}
