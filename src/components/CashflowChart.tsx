import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type Props = { data: { month: string; income: number; expenses: number }[]; currency: string }

export default function CashflowChart({ data, currency }: Props) {
  const currencyCode = currency.trim().toUpperCase() === 'BS' ? 'BOB' : currency.trim().toUpperCase()
  const formatMoney = (amount: number, locale: string, compact = false) => {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currencyCode,
        ...(compact ? { notation: 'compact' as const, maximumFractionDigits: 1 } : {}),
      }).format(amount)
    } catch {
      return `${currency} ${amount.toLocaleString(locale, { maximumFractionDigits: compact ? 1 : 2 })}`
    }
  }
  return <ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 10, right: 6, left: -18, bottom: 0 }}>
    <defs>
      <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#31b98b" stopOpacity={0.19} /><stop offset="100%" stopColor="#31b98b" stopOpacity={0} /></linearGradient>
      <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#aba2ef" stopOpacity={0.18} /><stop offset="100%" stopColor="#aba2ef" stopOpacity={0} /></linearGradient>
    </defs>
    <CartesianGrid vertical={false} stroke="#eef0f4" strokeDasharray="3 5" />
    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#9da3af', fontSize: 11 }} dy={11} />
    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9da3af', fontSize: 11 }} tickFormatter={(value: number) => formatMoney(value, 'es-BO', true)} />
    <Tooltip formatter={(value) => formatMoney(Number(value), 'es-BO')} contentStyle={{ border: '1px solid #eceef2', borderRadius: 12, boxShadow: '0 8px 24px #17203312' }} />
    <Area type="monotone" dataKey="income" name="Ingresos" stroke="#38b88d" strokeWidth={2.5} fill="url(#incomeFill)" activeDot={{ r: 4 }} />
    <Area type="monotone" dataKey="expenses" name="Gastos" stroke="#a99ee9" strokeWidth={2.5} fill="url(#expenseFill)" activeDot={{ r: 4 }} />
  </AreaChart></ResponsiveContainer>
}
