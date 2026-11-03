import { Maximize2, Music2 } from 'lucide-react'

export interface TrackInfoProps {
  title: string
  artist: string
  coverUrl?: string
  onOpenCover: () => void
}

export default function TrackInfo({ title, artist, coverUrl, onOpenCover }: TrackInfoProps) {
  return (
    <div className="mc36-track-info">
      <button type="button" className="mc36-cover-button" onClick={onOpenCover} aria-label={`Ampliar capa de ${title}`}>
        {coverUrl ? <img src={coverUrl} alt="" /> : <Music2 size={23} aria-hidden="true" />}
        <Maximize2 className="mc36-cover-expand" size={13} aria-hidden="true" />
      </button>
      <div className="mc36-track-copy"><strong title={title}>{title}</strong><small title={artist}>{artist}</small></div>
    </div>
  )
}
