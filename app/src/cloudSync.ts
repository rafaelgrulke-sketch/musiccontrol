/** Sincronização explícita: os arquivos locais não são excluídos após o envio. */
import { supabase } from './supabase'

export const CLOUD_BUCKET = 'music-files'
const MAX_FILE_SIZE = 50 * 1024 * 1024

export type CloudSong = {
  id: string
  user_id: string
  title: string
  artist: string
  album: string | null
  file_path: string
  cover_path: string | null
  file_size: number
  mime_type: string
  imported_at: string
  updated_at?: string
}
export type CloudPlaylist = {
  id: string
  user_id: string
  name: string
  song_ids: string[]
  updated_at?: string
}
export type LocalSongForUpload = {
  id: string
  title: string
  artist: string
  album?: string
  file: Blob
  cover?: Blob
  importedAt: number
}
export type LocalPlaylistForUpload = { id: string; name: string; songIds: string[] }

function readableError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

const PAGE_SIZE = 100

export async function listCloudSongs(userId: string): Promise<CloudSong[]> {
  const result: CloudSong[] = []
  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await supabase.from('cloud_songs')
      .select('id,user_id,title,artist,album,file_path,cover_path,file_size,mime_type,imported_at,updated_at')
      .eq('user_id', userId).order('imported_at', { ascending: true }).order('id', { ascending: true })
      .range(start, start + PAGE_SIZE - 1)
    if (error) throw new Error(`Erro ao consultar faixas na nuvem: ${error.message}`)
    const page = (data ?? []) as CloudSong[]
    result.push(...page)
    if (page.length < PAGE_SIZE) return result
  }
}

export async function listCloudPlaylists(userId: string): Promise<CloudPlaylist[]> {
  const result: CloudPlaylist[] = []
  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await supabase.from('cloud_playlists')
      .select('id,user_id,name,song_ids,updated_at').eq('user_id', userId)
      .order('id', { ascending: true }).range(start, start + PAGE_SIZE - 1)
    if (error) throw new Error(`Erro ao consultar playlists na nuvem: ${error.message}`)
    const page = (data ?? []) as CloudPlaylist[]
    result.push(...page)
    if (page.length < PAGE_SIZE) return result
  }
}

export async function uploadSong(userId: string, song: LocalSongForUpload): Promise<void> {
  if (song.file.size > MAX_FILE_SIZE) {
    throw new Error(`A faixa “${song.title}” ultrapassa o limite de 50 MB por arquivo.`)
  }
  // O primeiro segmento do caminho é a identidade do usuário; RLS valida esse segmento.
  const filePath = `${userId}/${song.id}/audio`
  const { error: fileError } = await supabase.storage.from(CLOUD_BUCKET)
    .upload(filePath, song.file, { upsert: true, contentType: song.file.type || 'audio/mpeg' })
  if (fileError) throw new Error(`Áudio “${song.title}”: ${fileError.message}`)

  let coverPath: string | null = null
  if (song.cover) {
    if (song.cover.size > MAX_FILE_SIZE) throw new Error('Capa acima do limite permitido.')
    coverPath = `${userId}/${song.id}/cover`
    const { error: coverError } = await supabase.storage.from(CLOUD_BUCKET)
      .upload(coverPath, song.cover, { upsert: true, contentType: song.cover.type || 'image/jpeg' })
    if (coverError) throw new Error(`Capa “${song.title}”: ${coverError.message}`)
  }

  const { data: prior } = await supabase.from('cloud_songs')
    .select('cover_path').eq('user_id', userId).eq('id', song.id).maybeSingle()
  if (!coverPath && prior?.cover_path) {
    const { error: deleteCoverError } = await supabase.storage.from(CLOUD_BUCKET).remove([prior.cover_path])
    if (deleteCoverError) throw new Error(`Não foi possível remover a capa antiga: ${deleteCoverError.message}`)
  }
  const record: CloudSong = {
    id: song.id, user_id: userId, title: song.title, artist: song.artist,
    album: song.album || null, file_path: filePath, cover_path: coverPath,
    file_size: song.file.size, mime_type: song.file.type || 'audio/mpeg',
    imported_at: new Date(song.importedAt || Date.now()).toISOString(),
  }
  const { error } = await supabase.from('cloud_songs').upsert(record, { onConflict: 'id,user_id' })
  if (error) throw new Error(`Metadados “${song.title}”: ${error.message}`)
}

export async function uploadPlaylists(userId: string, playlists: LocalPlaylistForUpload[]): Promise<void> {
  if (!playlists.length) return
  const { error } = await supabase.from('cloud_playlists').upsert(
    playlists.map(p => ({ id: p.id, user_id: userId, name: p.name, song_ids: p.songIds })),
    { onConflict: 'id,user_id' }
  )
  if (error) throw new Error(`Erro ao enviar playlists: ${error.message}`)
}

export async function downloadCloudSong(song: CloudSong): Promise<{ file: Blob; cover?: Blob }> {
  const { data: file, error: fileError } = await supabase.storage.from(CLOUD_BUCKET).download(song.file_path)
  if (fileError || !file) throw readableError(fileError ?? new Error(`Arquivo não encontrado: ${song.title}`))
  if (!song.cover_path) return { file }
  const { data: cover, error: coverError } = await supabase.storage.from(CLOUD_BUCKET).download(song.cover_path)
  if (coverError) throw new Error(`Capa “${song.title}”: ${coverError.message}`)
  return { file, cover: cover || undefined }
}
