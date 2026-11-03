import { Volume2, VolumeX } from 'lucide-react'
import { usePlayerVolume } from '../hooks/usePlayerVolume'

interface VolumeControlProps {
  volume: number
  onVolumeChange: (value: number) => void
}
export default function VolumeControl({ volume, onVolumeChange }: VolumeControlProps) {
  const { muted, changeVolume, toggleMute } = usePlayerVolume(volume, onVolumeChange)
  return (
    <div className="mc36-volume">
      <button type="button" className="mc36-icon" onClick={toggleMute} title={muted ? 'Ativar som' : 'Silenciar'} aria-label={muted ? 'Ativar som' : 'Silenciar'}>
        {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>
      <input type="range" min={0} max={1} step={0.01} value={volume} onChange={event => changeVolume(Number(event.target.value))} aria-label="Volume" style={{ backgroundSize: `${volume * 100}% 100%` }} />
    </div>
  )
}
