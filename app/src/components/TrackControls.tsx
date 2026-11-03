import { Pause, Play, Repeat2, Shuffle, SkipBack, SkipForward } from 'lucide-react'
import Visualizer from './Visualizer'

export interface TrackControlsProps {
  playing: boolean
  shuffle: boolean
  repeat: boolean
  progress: number
  duration: number
  onTogglePlay: () => void
  onPrevious: () => void
  onNext: () => void
  onToggleShuffle: () => void
  onToggleRepeat: () => void
  onSeek: (seconds: number) => void
}
const time = (value: number) => Number.isFinite(value)
  ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}` : '0:00'

export default function TrackControls(props: TrackControlsProps) {
  const { playing, shuffle, repeat, progress, duration, onTogglePlay, onPrevious, onNext, onToggleShuffle, onToggleRepeat, onSeek } = props
  const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0)
  const safeProgress = Math.min(safeDuration, Math.max(0, progress))
  return (
    <div className="mc36-center">
      <div className="mc36-buttons">
        <button type="button" className={`mc36-icon mc36-secondary ${shuffle ? 'is-active' : ''}`} onClick={onToggleShuffle} aria-label="Modo aleatório" aria-pressed={shuffle} title="Aleatório"><Shuffle size={17} /></button>
        <button type="button" className="mc36-icon" onClick={onPrevious} aria-label="Faixa anterior"><SkipBack size={20} fill="currentColor" /></button>
        <button type="button" className="mc36-play" onClick={onTogglePlay} aria-label={playing ? 'Pausar' : 'Reproduzir'}>{playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}</button>
        <button type="button" className="mc36-icon" onClick={onNext} aria-label="Próxima faixa"><SkipForward size={20} fill="currentColor" /></button>
        <button type="button" className={`mc36-icon mc36-secondary ${repeat ? 'is-active' : ''}`} onClick={onToggleRepeat} aria-label="Repetir música" aria-pressed={repeat} title="Repetir"><Repeat2 size={17} /></button>
        <Visualizer playing={playing} />
      </div>
      <div className="mc36-seek">
        <time>{time(safeProgress)}</time>
        <input type="range" min={0} max={safeDuration || 1} step={0.1} value={safeProgress} onChange={event => onSeek(Number(event.target.value))} aria-label="Posição da música" style={{ backgroundSize: `${safeDuration ? (safeProgress / safeDuration * 100) : 0}% 100%` }} />
        <time>{time(safeDuration)}</time>
      </div>
    </div>
  )
}
