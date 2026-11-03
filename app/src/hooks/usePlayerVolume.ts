import { useCallback, useRef } from 'react'

/** Mantém o volume na App: apenas coordena slider, mute e restauração. */
export function usePlayerVolume(volume: number, onVolumeChange: (volume: number) => void) {
  const previousVolume = useRef(volume > 0 ? volume : 0.8)
  const changeVolume = useCallback((next: number) => {
    const safe = Math.min(1, Math.max(0, next))
    if (safe > 0) previousVolume.current = safe
    onVolumeChange(safe)
  }, [onVolumeChange])
  const toggleMute = useCallback(() => {
    if (volume > 0) {
      previousVolume.current = volume
      onVolumeChange(0)
    } else {
      onVolumeChange(previousVolume.current || 0.8)
    }
  }, [volume, onVolumeChange])
  return { muted: volume <= 0, changeVolume, toggleMute }
}
