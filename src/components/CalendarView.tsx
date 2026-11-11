import { CalendarDays, Check, ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { createObligation, deleteObligation, updateObligationStatus } from '../services/obligationService'
import type { Category, DatabaseId, Obligation, ObligationStatus } from '../types/finance'

type Props = {
  userId: DatabaseId
  obligations: Obligation[]
  categories: Category[]
  onRefresh: () => Promise<void>
  loadError: string
}

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const startOfWeek = (date: Date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  return start
}
const money = (amount: number) => new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)

export default function CalendarView({ userId, obligations, categories, onRefresh, loadError }: Props) {
  const [todayKey] = useState(() => dateKey(new Date()))
  const [selectedDate, setSelectedDate] = useState(() => todayKey)
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [view, setView] = useState<'month' | 'week'>('month')
  const [modalOpen, setModalOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(() => todayKey)
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState<ObligationStatus>('Pendiente')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')

  const days = useMemo(() => {
    if (view === 'week') {
      return Array.from({ length: 7 }, (_, index) => {
        const day = startOfWeek(new Date(`${selectedDate}T12:00:00`))
        day.setDate(day.getDate() + index)
        return day
      })
    }
    const first = startOfWeek(visibleMonth)
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(first)
      day.setDate(first.getDate() + index)
      return day
    })
  }, [selectedDate, view, visibleMonth])
  const selectedObligations = obligations.filter((item) => item.dueDate === selectedDate)
  const pendingCount = obligations.filter((item) => item.status === 'Pendiente').length

  const openNew = (date = selectedDate) => {
    setSelectedDate(date)
    setDueDate(date)
    setTitle('')
    setAmount('')
    setCategoryId('')
    setStatus('Pendiente')
    setError('')
    setModalOpen(true)
  }

  const changeMonth = (amount: number) => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + amount, 1))
  const changeWeek = (amount: number) => {
    const date = new Date(`${selectedDate}T12:00:00`)
    date.setDate(date.getDate() + amount * 7)
    setSelectedDate(dateKey(date))
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsedAmount = Number(amount)
    if (!title.trim()) {
      setError('Escribe un título para la obligación.')
      return
    }
    if (!dueDate) {
      setError('Selecciona una fecha de vencimiento.')
      return
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setError('Ingresa un monto estimado válido.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await createObligation(userId, {
        title: title.trim(),
        dueDate,
        estimatedAmount: parsedAmount,
        categoryId: categoryId || null,
        status,
      })
      await onRefresh()
      setModalOpen(false)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar la obligación.')
    } finally {
      setSaving(false)
    }
  }

  const markPaid = async (obligation: Obligation) => {
    setActionError('')
    try {
      await updateObligationStatus(obligation.id, obligation.status === 'Pagado' ? 'Pendiente' : 'Pagado')
      await onRefresh()
    } catch (updateError) {
      setActionError(updateError instanceof Error ? updateError.message : 'No se pudo actualizar la obligación.')
    }
  }

  const remove = async (obligation: Obligation) => {
    if (!window.confirm(`¿Eliminar la obligación "${obligation.title}"?`)) return
    setActionError('')
    try {
      await deleteObligation(obligation.id)
      await onRefresh()
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : 'No se pudo eliminar la obligación.')
    }
  }

  const displayMonth = view === 'month'
    ? visibleMonth.toLocaleDateString('es', { month: 'long', year: 'numeric' })
    : `${new Date(`${selectedDate}T12:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'long' })} · semana`

  return <div className="calendar-page">
    <div className="calendar-toolbar">
      <div className="calendar-intro"><span className="calendar-icon"><CalendarDays size={20} /></span><div><h2>Calendario y obligaciones</h2><p>{pendingCount} obligaciones pendientes</p></div></div>
      <button className="button-primary" onClick={() => openNew()}><Plus size={16} /> Nueva obligación</button>
    </div>
    {loadError && <p className="calendar-error" role="alert">{loadError}<button className="text-button" onClick={() => void onRefresh().catch(() => undefined)}>Reintentar</button></p>}
    {actionError && <p className="calendar-error" role="alert">{actionError}</p>}
    <div className="calendar-layout">
      <section className="panel calendar-panel">
        <div className="calendar-controls">
          <div className="calendar-month-controls"><button className="icon-button" aria-label="Periodo anterior" onClick={() => view === 'month' ? changeMonth(-1) : changeWeek(-1)}><ChevronLeft size={18} /></button><h3>{displayMonth}</h3><button className="icon-button" aria-label="Periodo siguiente" onClick={() => view === 'month' ? changeMonth(1) : changeWeek(1)}><ChevronRight size={18} /></button></div>
          <div className="calendar-view-switch"><button className={view === 'month' ? 'selected' : ''} onClick={() => setView('month')}>Mes</button><button className={view === 'week' ? 'selected' : ''} onClick={() => setView('week')}>Semana</button></div>
        </div>
        <div className="calendar-grid">
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}
          {days.map((day) => {
            const key = dateKey(day)
            const dayObligations = obligations.filter((item) => item.dueDate === key)
            const isOutsideMonth = view === 'month' && day.getMonth() !== visibleMonth.getMonth()
            return <button type="button" className={`calendar-day ${key === selectedDate ? 'selected' : ''} ${isOutsideMonth ? 'outside-month' : ''} ${key === todayKey ? 'today' : ''}`} key={key} onClick={() => openNew(key)} aria-label={`${day.toLocaleDateString('es')} ${dayObligations.length ? `, ${dayObligations.length} obligaciones` : ''}`}>
              <span className="calendar-day-number">{day.getDate()}</span>
              {dayObligations.slice(0, 2).map((item) => <span className={`calendar-event ${item.status === 'Pagado' ? 'paid' : ''}`} key={item.id}>{item.title}</span>)}
              {dayObligations.length > 2 && <small className="calendar-more">+{dayObligations.length - 2} más</small>}
            </button>
          })}
        </div>
        <p className="calendar-hint">Selecciona una fecha para registrar una obligación.</p>
      </section>
      <section className="panel calendar-obligations">
        <div className="calendar-obligations-heading"><div><h3>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}</h3><p>{selectedObligations.length} obligaciones</p></div><button className="icon-button" title="Nueva obligación en esta fecha" aria-label="Nueva obligación en esta fecha" onClick={() => openNew(selectedDate)}><Plus size={18} /></button></div>
        <div className="obligation-list">
          {selectedObligations.map((obligation) => {
            const category = categories.find((item) => item.id === obligation.categoryId)?.name
            return <article className="obligation-card" key={obligation.id}>
              <div className="obligation-card-top"><span className={`obligation-status ${obligation.status === 'Pagado' ? 'paid' : ''}`}>{obligation.status}</span><div><button className="icon-button" aria-label={obligation.status === 'Pagado' ? 'Marcar pendiente' : 'Marcar pagada'} title={obligation.status === 'Pagado' ? 'Marcar pendiente' : 'Marcar pagada'} onClick={() => void markPaid(obligation)}><Check size={15} /></button><button className="icon-button" aria-label={`Eliminar ${obligation.title}`} onClick={() => void remove(obligation)}><Trash2 size={15} /></button></div></div>
              <strong>{obligation.title}</strong>
              <small>{category || 'Sin categoría'}</small>
              <b className="obligation-amount">{money(obligation.estimatedAmount)}</b>
            </article>
          })}
          {selectedObligations.length === 0 && <div className="calendar-empty"><CalendarDays size={24} /><span>No hay obligaciones para esta fecha.</span><button className="text-button" onClick={() => openNew(selectedDate)}>Agregar obligación</button></div>}
        </div>
      </section>
    </div>
    {modalOpen && <div className="modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModalOpen(false) }}>
      <section className="modal-card obligation-modal" role="dialog" aria-modal="true" aria-labelledby="obligation-modal-title">
        <div className="modal-heading"><div><div className="eyebrow">FINORA · CALENDARIO</div><h2 id="obligation-modal-title">Nueva obligación</h2></div><button className="icon-button" onClick={() => setModalOpen(false)} aria-label="Cerrar" disabled={saving}><X size={20} /></button></div>
        <form onSubmit={(event) => void save(event)}>
          <div className="form-content obligation-form">
            <label className="form-field"><span>Título</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej. Pagar luz de la farmacia" maxLength={140} required /></label>
            <div className="form-grid">
              <label className="form-field"><span>Fecha de vencimiento</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label>
              <label className="form-field"><span>Monto estimado</span><input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /></label>
              <label className="form-field"><span>Categoría</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Sin categoría</option>{categories.filter((item) => item.active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label className="form-field"><span>Estado</span><select value={status} onChange={(event) => setStatus(event.target.value as ObligationStatus)}><option value="Pendiente">Pendiente</option><option value="Pagado">Pagado</option></select></label>
            </div>
            {error && <p className="calendar-error" role="alert">{error}</p>}
          </div>
          <div className="modal-actions"><button type="button" className="button-secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</button><button className="button-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar obligación'}</button></div>
        </form>
      </section>
    </div>}
  </div>
}
