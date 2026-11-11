import { ArrowDownLeft, ArrowUpRight, Ellipsis } from 'lucide-react'
import type { ReactNode } from 'react'

type Props = {
  label: string
  value: string
  change?: string
  positive?: boolean
  icon: ReactNode
  tone: 'green' | 'purple' | 'orange' | 'blue'
  caption?: string
}

export default function SummaryCard({ label, value, change, positive = true, icon, tone, caption = 'vs. mes anterior' }: Props) {
  return (
    <article className="summary-card">
      <div className="summary-top">
        <div className={`summary-icon ${tone}`}>{icon}</div>
        <button className="icon-button tiny-menu" aria-label={`Opciones de ${label}`}><Ellipsis size={19} /></button>
      </div>
      <div className="summary-label">{label}</div>
      <div className="summary-value">{value}</div>
      <div className="summary-footer">
        {change && <span className={`change-pill ${positive ? 'up' : 'down'}`}>
          {positive ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}{change}
        </span>}
        <span>{caption}</span>
      </div>
    </article>
  )
}
