import { ArrowDownLeft, ArrowUpRight, Eye, Pencil, Trash2, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { Movement } from '../types/finance'

type MovementReceipt = { id: string; url: string; isImage: boolean }

const iconStyles: Record<string, string> = {
  'Nómina': 'lavender', 'Alimentación': 'peach', 'Ventas': 'mint',
  'Servicios': 'blue', 'Transporte': 'yellow', 'Suscripciones': 'pink',
}

const formatDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
const money = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat('es-US', { style: 'currency', currency: currency || 'USD' }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString('es')}`
  }
}

type Props = {
  movements: Movement[]
  compact?: boolean
  onNew?: () => void
  canView?: boolean
  onLoadReceipts: (movementId: Movement['id']) => Promise<MovementReceipt[]>
  onView?: (movement: Movement) => void
  onEdit?: (movement: Movement) => void
  onDelete?: (movement: Movement) => void
}

export default function TransactionsTable({ movements, compact = false, onNew, canView = false, onLoadReceipts, onView, onEdit, onDelete }: Props) {
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<Movement | null>(null)
  const [receipts, setReceipts] = useState<MovementReceipt[]>([])
  const [receiptsLoading, setReceiptsLoading] = useState(false)
  const [receiptsError, setReceiptsError] = useState('')
  const receiptRequest = useRef(0)
  const pageSize = compact ? 5 : 8
  const totalPages = Math.max(1, Math.ceil(movements.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const visible = useMemo(() => movements.slice((currentPage - 1) * pageSize, currentPage * pageSize), [movements, currentPage, pageSize])
  const hasActions = Boolean(canView || onEdit || onDelete)

  const openDetail = async (movement: Movement) => {
    const requestId = ++receiptRequest.current
    setDetail(movement)
    setReceipts([])
    setReceiptsError('')
    setReceiptsLoading(true)
    try {
      const items = await onLoadReceipts(movement.id)
      if (receiptRequest.current === requestId) setReceipts(items)
    } catch (error) {
      if (receiptRequest.current === requestId) {
        setReceiptsError(error instanceof Error ? error.message : 'No se pudieron cargar los comprobantes.')
      }
    } finally {
      if (receiptRequest.current === requestId) setReceiptsLoading(false)
    }
  }

  const closeDetail = () => {
    receiptRequest.current += 1
    setDetail(null)
  }

  return (
    <section className="panel transactions-panel">
      <div className="panel-heading table-heading">
        <div><h2>{compact ? 'Últimos movimientos' : 'Todos los movimientos'}</h2><p>{compact ? 'Tu actividad financiera más reciente' : `${movements.length} transacciones registradas`}</p></div>
        {compact ? <button className="text-button" onClick={onNew}>Ver todos <span>→</span></button> : <button className="filter-button" onClick={() => setPage(1)}>Últimos primero <span>⌄</span></button>}
      </div>
      <div className="table-scroll">
        <table className="movement-table">
          <thead><tr><th>DESCRIPCIÓN</th><th>CATEGORÍA</th><th>CUENTA</th><th>FECHA</th><th className="amount-col">IMPORTE</th>{hasActions && <th aria-label="Acciones" />}</tr></thead>
          <tbody>
            {visible.length ? visible.map((movement) => (
              <tr key={movement.id}>
                <td><div className="movement-name"><span className={`category-icon ${iconStyles[movement.category] ?? 'blue'}`}>{movement.categoryIcon === 'users' ? '♙' : movement.categoryIcon === 'briefcase' ? '▣' : movement.categoryIcon === 'utensils' ? '◉' : movement.categoryIcon === 'car' ? '↗' : movement.categoryIcon === 'zap' ? 'ϟ' : '✦'}</span><div><strong>{movement.description}</strong><small>{movement.payment}</small></div>{movement.receiptUrl && <a className="receipt-thumbnail" href={movement.receiptUrl} target="_blank" rel="noreferrer" aria-label="Abrir comprobante">{movement.receiptIsImage ? <img src={movement.receiptUrl} alt="Comprobante" loading="lazy" /> : <span>PDF</span>}</a>}</div></td>
                <td><span className="category-tag">{movement.category}</span></td>
                <td><span className="account-cell"><span className="account-dot" />{movement.account}</span></td>
                <td className="date-cell">{formatDate(movement.date)}</td>
                <td className={`amount-cell ${movement.type === 'Ingreso' ? 'income' : ''}`}>{movement.type === 'Ingreso' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}{movement.type === 'Ingreso' ? '+' : '−'}{money(movement.amount, movement.currency)}</td>
                {hasActions && <td><div className="movement-actions">
                  {canView && <button className="icon-button row-menu" aria-label={`Ver movimiento: ${movement.description}`} title="Ver detalle" onClick={() => onView ? onView(movement) : void openDetail(movement)}><Eye size={16} /></button>}
                  {onEdit && <button className="icon-button row-menu" aria-label={`Editar movimiento: ${movement.description}`} title="Editar" onClick={() => onEdit(movement)}><Pencil size={15} /></button>}
                  {onDelete && <button className="icon-button row-menu" aria-label={`Eliminar movimiento: ${movement.description}`} title="Eliminar" onClick={() => onDelete(movement)}><Trash2 size={15} /></button>}
                </div></td>}
              </tr>
            )) : <tr><td colSpan={hasActions ? 6 : 5} className="empty-table">No hay movimientos que coincidan con los filtros.</td></tr>}
          </tbody>
        </table>
      </div>
      {!compact && <div className="table-pagination">
        <span>Mostrando {movements.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, movements.length)} de {movements.length} movimientos</span>
        <div><button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</button><span className="page-number">{currentPage}</span><button disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Siguiente</button></div>
      </div>}
      {detail && <div className="modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDetail() }}>
        <section className="modal-card movement-detail-modal" role="dialog" aria-modal="true" aria-labelledby="movement-detail-title">
          <div className="modal-heading"><div><div className="eyebrow">FINORA · MOVIMIENTO</div><h2 id="movement-detail-title">Detalle del movimiento</h2></div><button className="icon-button" onClick={closeDetail} aria-label="Cerrar detalle"><X size={20} /></button></div>
          <dl className="movement-detail-list">
            <div><dt>Descripción</dt><dd>{detail.description}</dd></div><div><dt>Tipo</dt><dd>{detail.type}</dd></div>
            <div><dt>Importe</dt><dd>{money(detail.amount, detail.currency)}</dd></div><div><dt>Fecha</dt><dd>{formatDate(detail.date)}</dd></div>
            <div><dt>Categoría</dt><dd>{detail.category}</dd></div><div><dt>Cuenta</dt><dd>{detail.account}</dd></div>
            <div><dt>Método de pago</dt><dd>{detail.payment}</dd></div>
          </dl>
          <section className="movement-receipts" aria-live="polite">
            <h3>Comprobantes</h3>
            {receiptsLoading && <p className="movement-receipts-state">Cargando comprobantes…</p>}
            {receiptsError && <p className="movement-receipts-error" role="alert">{receiptsError}</p>}
            {!receiptsLoading && !receiptsError && receipts.length === 0 && <p className="movement-receipts-state">Este movimiento no tiene comprobantes adjuntos.</p>}
            {receipts.map((receipt) => <a className="movement-receipt-preview" key={receipt.id} href={receipt.url} target="_blank" rel="noreferrer">
              {receipt.isImage ? <img src={receipt.url} alt={`Comprobante de ${detail.description}`} /> : <span className="receipt-pdf">PDF</span>}
              <span>Ver o descargar comprobante</span>
            </a>)}
          </section>
          <div className="modal-actions"><button className="button-secondary" onClick={closeDetail}>Cerrar</button></div>
        </section>
      </div>}
    </section>
  )
}
