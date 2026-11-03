import type { CSSProperties } from 'react'
import { ListOrdered } from 'lucide-react'
import TrackInfo from './TrackInfo'
import TrackControls, { type TrackControlsProps } from './TrackControls'
import VolumeControl from './VolumeControl'
import { useArtworkAtmosphere } from '../hooks/useArtworkAtmosphere'

export interface PlayerProps extends TrackControlsProps {
  title: string
  artist: string
  coverUrl?: string
  volume: number
  queueLength: number
  onVolumeChange: (volume: number) => void
  onOpenCover: () => void
  onOpenQueue: () => void
}

export default function Player(props: PlayerProps) {
  const color = useArtworkAtmosphere(props.coverUrl)
  return (
    <footer className="player mc36-player" style={{ '--mc36-color': color } as CSSProperties} aria-label="Player de música">
      <div className="mc36-atmosphere" aria-hidden="true" />
      <TrackInfo title={props.title} artist={props.artist} coverUrl={props.coverUrl} onOpenCover={props.onOpenCover} />
      <TrackControls {...props} />
      <div className="mc36-end">
        <button type="button" className="mc36-icon mc36-queue" onClick={props.onOpenQueue} aria-label={`Abrir fila de reprodução com ${props.queueLength} músicas`} title="Fila de reprodução">
          <ListOrdered size={21} />
          {props.queueLength > 0 && <span>{props.queueLength}</span>}
        </button>
        <VolumeControl volume={props.volume} onVolumeChange={props.onVolumeChange} />
      </div>
    </footer>
  )
}
