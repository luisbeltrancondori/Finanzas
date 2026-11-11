import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type ChartValue = { name: string; value: number; color?: string; count?: number }
type CashflowValue = { month: string; income: number; expenses: number }
type UserSummary = { id: string; name: string; email: string; income: number; expenses: number; net: number }

type Props = {
  expenseCategories: ChartValue[]
  cashflow: CashflowValue[]
  currencyBalances: ChartValue[]
  paymentMethods: ChartValue[]
  currencyCode: string
  userSummaries: UserSummary[]
}

const COLORS = ['#256c4c', '#43a77b', '#83c9a4', '#a99ee9', '#efaa72', '#5e9ad6', '#d97575', '#d6bd62']

function formatCurrency(value: number, currencyCode: string) {
  const code = currencyCode.trim().toUpperCase() === 'BS' ? 'BOB' : currencyCode.trim().toUpperCase()
  try {
    return new Intl.NumberFormat('es-BO', { style: 'currency', currency: code, maximumFractionDigits: 2 }).format(value)
  } catch {
    return `${currencyCode} ${value.toLocaleString('es-BO', { maximumFractionDigits: 2 })}`
  }
}

function EmptyChart() {
  return <div className="analytics-empty">No hay datos suficientes para mostrar este gráfico.</div>
}

export default function DashboardAnalytics({ expenseCategories, cashflow, currencyBalances, paymentMethods, currencyCode, userSummaries }: Props) {
  const [hiddenCategories, setHiddenCategories] = useState<string[]>([])
  const visibleCategories = expenseCategories.filter(({ name }) => !hiddenCategories.includes(name))
  const toggleCategory = (name: string) => setHiddenCategories((current) => current.includes(name)
    ? current.filter((item) => item !== name)
    : [...current, name])

  return (
    <div className="dashboard-analytics">
    <section className="analytics-grid" aria-label="Estadísticas financieras">
      <article className="panel analytics-card">
        <div className="analytics-heading"><div><h2>Gastos por categoría</h2><p>Distribución de gastos según filtros</p></div><span className="analytics-icon violet">◔</span></div>
        {expenseCategories.length ? <>
          {visibleCategories.length > 0
            ? <div className="analytics-donut-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={visibleCategories} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={3} stroke="none">
                    {visibleCategories.map((entry) => <Cell key={entry.name} fill={entry.color ?? COLORS[expenseCategories.findIndex((item) => item.name === entry.name) % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(Number(value), currencyCode)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            : <div className="analytics-empty analytics-donut-empty">Todas las categorías están ocultas. Activa una en la leyenda.</div>}
          <div className="analytics-legend">
            {expenseCategories.map((entry, index) => {
              const hidden = hiddenCategories.includes(entry.name)
              return <button type="button" className={hidden ? 'is-muted' : ''} key={entry.name} onClick={() => toggleCategory(entry.name)} aria-pressed={!hidden}>
                <i style={{ background: entry.color ?? COLORS[index % COLORS.length] }} /><span>{entry.name}</span><b>{formatCurrency(entry.value, currencyCode)}</b>
              </button>
            })}
          </div>
        </> : <EmptyChart />}
      </article>

      <article className="panel analytics-card">
        <div className="analytics-heading"><div><h2>Ingresos vs. egresos</h2><p>Comparación mensual · últimos seis meses</p></div><span className="analytics-icon green">↕</span></div>
        {cashflow.some((item) => item.income > 0 || item.expenses > 0) ? <div className="analytics-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cashflow} margin={{ top: 8, right: 3, left: -18, bottom: 0 }} barGap={5}>
              <CartesianGrid vertical={false} stroke="#eef0f4" strokeDasharray="3 5" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#9299a2', fontSize: 10 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9299a2', fontSize: 9 }} tickFormatter={(value: number) => value.toLocaleString('es-BO', { notation: 'compact', maximumFractionDigits: 1 })} />
              <Tooltip formatter={(value) => formatCurrency(Number(value), currencyCode)} contentStyle={{ border: '1px solid #eceef2', borderRadius: 10, boxShadow: '0 8px 24px #17203312' }} />
              <Bar dataKey="income" name="Ingresos" fill="#35a878" radius={[4, 4, 0, 0]} maxBarSize={24} />
              <Bar dataKey="expenses" name="Egresos" fill="#aaa0e8" radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div> : <EmptyChart />}
        <div className="analytics-inline-legend"><span><i className="income" />Ingresos</span><span><i className="expense" />Egresos</span></div>
      </article>

      <article className="panel analytics-card">
        <div className="analytics-heading"><div><h2>Distribución por moneda</h2><p>Saldos de cuentas convertidos a {currencyCode}</p></div><span className="analytics-icon blue">◉</span></div>
        {currencyBalances.some((item) => item.value > 0) ? <div className="analytics-chart analytics-horizontal">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={currencyBalances} layout="vertical" margin={{ top: 4, right: 16, left: 3, bottom: 4 }}>
              <CartesianGrid horizontal={false} stroke="#eef0f4" strokeDasharray="3 5" />
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#707a74', fontSize: 10 }} width={52} />
              <Tooltip formatter={(value) => formatCurrency(Number(value), currencyCode)} />
              <Bar dataKey="value" name={`Saldo (${currencyCode})`} radius={[0, 5, 5, 0]} maxBarSize={24}>
                {currencyBalances.map((entry, index) => <Cell key={entry.name} fill={entry.color ?? COLORS[index % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div> : <EmptyChart />}
        <div className="analytics-legend analytics-currency-legend">{currencyBalances.map((entry, index) => <div key={entry.name}><i style={{ background: entry.color ?? COLORS[index % COLORS.length] }} /><span>{entry.name}</span><b>{formatCurrency(entry.value, currencyCode)}</b></div>)}</div>
      </article>

      <article className="panel analytics-card">
        <div className="analytics-heading"><div><h2>Métodos de pago</h2><p>Volumen de transacciones según filtros</p></div><span className="analytics-icon orange">▤</span></div>
        {paymentMethods.length ? <div className="analytics-chart analytics-horizontal">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={paymentMethods} layout="vertical" margin={{ top: 4, right: 16, left: 3, bottom: 4 }}>
              <CartesianGrid horizontal={false} stroke="#eef0f4" strokeDasharray="3 5" />
              <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#9299a2', fontSize: 9 }} />
              <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#707a74', fontSize: 10 }} width={84} />
              <Tooltip formatter={(value) => [`${Number(value)} transacciones`, 'Volumen']} />
              <Bar dataKey="value" name="Transacciones" fill="#e2a56d" radius={[0, 5, 5, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div> : <EmptyChart />}
        <div className="analytics-legend analytics-payment-legend">{paymentMethods.map((entry, index) => <div key={entry.name}><i style={{ background: COLORS[(index + 4) % COLORS.length] }} /><span>{entry.name}</span><b>{entry.value}</b></div>)}</div>
      </article>
    </section>
    <section className="panel user-report-card" aria-labelledby="user-report-title">
      <div className="analytics-heading user-report-heading">
        <div><h2 id="user-report-title">Operaciones por usuario</h2><p>Ingresos, egresos y neto gestionado · período visible y filtros aplicados · {currencyCode}</p></div>
      </div>
      {userSummaries.length > 0
        ? <div className="user-report-scroll"><table className="user-report-table">
          <thead><tr><th>Usuario / operador</th><th>Total ingresos</th><th>Total egresos</th><th>Neto gestionado</th></tr></thead>
          <tbody>{userSummaries.map((user) => <tr key={user.id}>
            <td><strong>{user.name}</strong>{user.email && <small>{user.email}</small>}</td>
            <td>{formatCurrency(user.income, currencyCode)}</td>
            <td>{formatCurrency(user.expenses, currencyCode)}</td>
            <td className={user.net < 0 ? 'negative-net' : 'positive-net'}>{formatCurrency(user.net, currencyCode)}</td>
          </tr>)}</tbody>
          <tfoot><tr><th>Totales</th><th>{formatCurrency(userSummaries.reduce((sum, user) => sum + user.income, 0), currencyCode)}</th><th>{formatCurrency(userSummaries.reduce((sum, user) => sum + user.expenses, 0), currencyCode)}</th><th>{formatCurrency(userSummaries.reduce((sum, user) => sum + user.net, 0), currencyCode)}</th></tr></tfoot>
        </table></div>
        : <p className="user-report-empty">No hay operaciones de usuarios para el período y los filtros seleccionados.</p>}
    </section>
    </div>
  )
}
