import { Cloud, Disc3, Home, Library, ListMusic, Music2, UsersRound } from 'lucide-react'
export type MusicTab = 'home' | 'library' | 'playlists' | 'artists' | 'cloud'
export interface SidebarProps {
  tab: MusicTab
  onNavigate: (tab: MusicTab) => void
}
const links = [
  { id: 'home', label: 'Início', Icon: Home },
  { id: 'library', label: 'Biblioteca', Icon: Library },
  { id: 'playlists', label: 'Playlists', Icon: ListMusic },
  { id: 'artists', label: 'Artistas', Icon: UsersRound },
  { id: 'cloud', label: 'Nuvem', Icon: Cloud },
] as const
export default function Sidebar({ tab, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon"><Music2 size={20} /></div>
        <span>Music<span className="brand-accent">Control</span></span>
      </div>
      <div className="nav-label">COLEÇÃO</div>
      <nav className="navigation" aria-label="Navegação principal">
        {links.map(({ id, label, Icon }) => (
          <button key={id} type="button" className={tab === id ? 'nav-active' : ''} onClick={() => onNavigate(id)} aria-current={tab === id ? 'page' : undefined}>
            <Icon size={18}/><span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom"><Disc3 size={16}/> MUSICCONTROL <span>3.6</span></div>
    </aside>
  )
}
