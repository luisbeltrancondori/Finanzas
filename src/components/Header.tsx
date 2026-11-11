import { Bell, Check, ChevronDown, Moon, Search, Sun, X } from 'lucide-react'
import { useState } from 'react'
import type { AuthenticatedUserProfile } from '../services/financeService'
import type { Category, Obligation } from '../types/finance'

type Theme = 'light' | 'dark'

type Props = {
  title: string
  subtitle: string
  search: string
  profile: AuthenticatedUserProfile
  onSearch: (value: string) => void
  onOpenProfile: () => void
  obligations: Obligation[]
  categories: Category[]
  onMarkObligationPaid: (obligation: Obligation) => void
  theme: Theme
  onToggleTheme: () => void
}

const dateOnly = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export default function Header({ title, subtitle, search, profile, onSearch, onOpenProfile, obligations, categories, onMarkObligationPaid, theme, onToggleTheme }: Props) {
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [todayKey] = useState(() => dateOnly(new Date()))
  const today = new Date(`${todayKey}T12:00:00`)
  const limit = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3)
  const limitKey = dateOnly(limit)
  const upcoming = obligations.filter((obligation) => obligation.status === 'Pendiente' && obligation.dueDate >= todayKey && obligation.dueDate <= limitKey)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const formatDueDate = (date: string) => date === todayKey ? 'Vence hoy' : new Date(`${date}T12:00:00`).toLocaleDateString('es', { day: '2-digit', month: 'short' })

  return (
    <header className="topbar">
      <div className="page-heading">
        <div className="breadcrumb">Workspace <span>/</span> <b>{title}</b></div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="topbar-actions">
        <button className="icon-button theme-toggle" onClick={onToggleTheme} aria-label={`Cambiar a modo ${theme === 'dark' ? 'claro' : 'oscuro'}`} title={`Modo ${theme === 'dark' ? 'claro' : 'oscuro'}`}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <label className="search-box">
          <Search size={17} />
          <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Buscar..." aria-label="Buscar" />
          <kbd>⌘ K</kbd>
        </label>
        <div className="notification-menu">
          <button className="icon-button notification-button" aria-label={`Notificaciones${upcoming.length ? `, ${upcoming.length} obligaciones próximas` : ''}`} aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((open) => !open)}>
            <Bell size={19} />{upcoming.length > 0 && <span className="notification-badge">{upcoming.length}</span>}
          </button>
          {notificationsOpen && <section className="notification-popover" aria-label="Obligaciones próximas">
            <div className="notification-popover-heading"><div><strong>Próximas obligaciones</strong><small>Vencen hoy o en los próximos 3 días</small></div><button className="icon-button" aria-label="Cerrar notificaciones" onClick={() => setNotificationsOpen(false)}><X size={16} /></button></div>
            <div className="notification-list">
              {upcoming.length === 0 && <p className="notification-empty">No tienes obligaciones próximas pendientes.</p>}
              {upcoming.map((obligation) => {
                const category = categories.find((item) => item.id === obligation.categoryId)?.name
                return <article className="notification-item" key={obligation.id}>
                  <div className="notification-item-copy"><strong>{obligation.title}</strong><small>{formatDueDate(obligation.dueDate)}{category ? ` · ${category}` : ''}</small></div>
                  <div className="notification-item-actions"><b>{obligation.estimatedAmount.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b><button className="icon-button" title="Marcar como pagado" aria-label={`Marcar ${obligation.title} como pagada`} onClick={() => onMarkObligationPaid(obligation)}><Check size={16} /></button></div>
                </article>
              })}
            </div>
          </section>}
        </div>
        <button className="topbar-avatar" onClick={onOpenProfile} aria-label="Editar perfil" title="Editar perfil">
          <span>{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : profile.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span><ChevronDown size={14} />
        </button>
      </div>
    </header>
  )
}
