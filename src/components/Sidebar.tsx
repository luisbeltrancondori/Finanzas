import { useState } from 'react'
import { ArrowLeftRight, CalendarDays, ChevronsLeft, ChevronsRight, CircleHelp, LayoutDashboard, LogOut, Menu, Settings2, ShieldCheck, UsersRound, WalletCards, X, ArrowLeftRight as TransferIcon } from 'lucide-react'
import HelpCenterModal from './HelpCenterModal'
import type { PageKey } from '../types/finance'
import type { AuthenticatedUserProfile } from '../services/financeService'

const primaryLinks: { key: PageKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Resumen', icon: LayoutDashboard },
  { key: 'movements', label: 'Movimientos', icon: ArrowLeftRight },
  { key: 'transfers', label: 'Transferencias', icon: TransferIcon },
  { key: 'accounts', label: 'Cuentas y bancos', icon: WalletCards },
  { key: 'calendar', label: 'Calendario', icon: CalendarDays },
]

type Props = {
  page: PageKey
  profile: AuthenticatedUserProfile
  canAccessPage: (page: PageKey) => boolean
  onOpenProfile: () => void
  onNavigate: (page: PageKey) => void
  onSignOut: () => void
  connectionStatus: string
}

export default function Sidebar({ page, profile, canAccessPage, onOpenProfile, onNavigate, onSignOut, connectionStatus }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const navigate = (next: PageKey) => {
    onNavigate(next)
    setMobileOpen(false)
  }

  return (
    <>
      <button className="mobile-menu icon-button" onClick={() => setMobileOpen(true)} aria-label="Abrir menú"><Menu size={20} /></button>
      {mobileOpen && <button className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú" />}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''} ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><span /></div>
          <span>finora</span>
          <button className="sidebar-collapse icon-button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'} title={collapsed ? 'Expandir menú' : 'Contraer menú'}>{collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}</button>
          <button className="mobile-close icon-button" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú"><X size={19} /></button>
        </div>
        {/* <button className="workspace-switch">
          <span className="workspace-avatar">AC</span>
          <span className="workspace-copy"><strong>Acme Corporation</strong><small>Plan Business</small></span>
          <ChevronDown size={16} className="muted" />
        </button> */}
        <div className="nav-caption">MENÚ PRINCIPAL</div>
        <nav className="nav-list" aria-label="Navegación principal">
          {primaryLinks.filter(({ key }) => canAccessPage(key)).map(({ key, label, icon: Icon }) => (
            <button key={key} className={`nav-link ${page === key ? 'active' : ''}`} onClick={() => navigate(key)}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
              {key === 'movements' && <span className="nav-count">12</span>}
            </button>
          ))}
          {canAccessPage('users') && <button className={`nav-link ${page === 'users' ? 'active' : ''}`} onClick={() => navigate('users')}><UsersRound size={18} strokeWidth={1.8} /><span>Usuarios</span></button>}
          {canAccessPage('permissions') && <button className={`nav-link ${page === 'permissions' ? 'active' : ''}`} onClick={() => navigate('permissions')}><ShieldCheck size={18} strokeWidth={1.8} /><span>Roles y permisos</span></button>}
        </nav>
        <div className="nav-caption catalog-caption">GESTIÓN</div>
        <nav className="nav-list" aria-label="Gestión">
          {canAccessPage('catalogs') && <button className={`nav-link ${page === 'catalogs' ? 'active' : ''}`} onClick={() => navigate('catalogs')}>
            <Settings2 size={18} strokeWidth={1.8} /><span>Configuración</span>
          </button>}
        </nav>
        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <div className="upgrade-icon">✦</div>
            <strong>Más claridad,<br />mejores decisiones.</strong>
            <p>Descubre todo lo que puedes hacer con Finora.</p>
            <button onClick={() => navigate('catalogs')}>Explorar funciones <span>↗</span></button>
          </div>
          <button className="nav-link support-link" onClick={() => setHelpOpen(true)} aria-label="Abrir centro de ayuda" title="Centro de ayuda"><CircleHelp size={18} /><span>Centro de ayuda</span></button>
          <div className="profile-row">
            <button className="profile-edit-trigger" onClick={onOpenProfile} aria-label="Editar perfil" title="Editar perfil">
              <span className="profile-avatar">{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : profile.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span>
              <span className="profile-copy"><strong>{profile.name}</strong><small>{profile.role}</small></span>
            </button>
            <button className="icon-button logout-button" onClick={onSignOut} aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut size={17} /></button>
          </div>
        </div>
      </aside>
      {helpOpen && <HelpCenterModal connectionStatus={connectionStatus} onClose={() => setHelpOpen(false)} />}
    </>
  )
}
