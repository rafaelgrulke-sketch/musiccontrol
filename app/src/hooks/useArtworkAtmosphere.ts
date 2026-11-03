import { useEffect, useState } from 'react'

/** Amostra a própria capa local sem guardar imagens ou acessar serviços externos. */
export function useArtworkAtmosphere(coverUrl?: string) {
  const [color, setColor] = useState('248, 46, 143')
  useEffect(() => {
    if (!coverUrl) { setColor('248, 46, 143'); return }
    let cancelled = false
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      if (cancelled) return
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 24; canvas.height = 24
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return
        ctx.drawImage(img, 0, 0, 24, 24)
        const pixels = ctx.getImageData(0, 0, 24, 24).data
        let r = 0, g = 0, b = 0, total = 0
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i + 3] < 200) continue
          const mx = Math.max(pixels[i], pixels[i + 1], pixels[i + 2])
          const mn = Math.min(pixels[i], pixels[i + 1], pixels[i + 2])
          const saturation = mx - mn
          if (mx < 24 || mx > 247 || saturation < 20) continue
          r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]; total++
        }
        if (total) {
          const clamp = (value: number) => Math.round(Math.max(30, Math.min(195, value / total)))
          setColor(`${clamp(r)}, ${clamp(g)}, ${clamp(b)}`)
        } else setColor('248, 46, 143')
      } catch {
        // Imagens remotas sem CORS não podem ser lidas pelo canvas.
        setColor('248, 46, 143')
      }
    }
    img.onerror = () => { if (!cancelled) setColor('248, 46, 143') }
    img.src = coverUrl
    return () => { cancelled = true; img.onload = null; img.onerror = null }
  }, [coverUrl])
  return color
}
