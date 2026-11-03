interface VisualizerProps {
  playing: boolean
}
export default function Visualizer({ playing }: VisualizerProps) {
  return (
    <div className={`mc36-visualizer ${playing ? 'is-playing' : ''}`} role="img" aria-label={playing ? 'Música reproduzindo' : 'Música pausada'}>
      {Array.from({ length: 11 }, (_, i) => <span key={i} style={{ animationDelay: `${(i % 5) * -0.14}s` }} />)}
    </div>
  )
}
