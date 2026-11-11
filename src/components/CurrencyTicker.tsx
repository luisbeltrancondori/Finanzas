import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, TrendingUp } from 'lucide-react'
import { applyCurrencyRates, getCurrencyRateToBase, getOfficialBcbRates, roundExchangeRate } from '../services/currencyService'
import type { Currency } from '../types/finance'

type Props = { currencies: Currency[]; baseCurrency?: Currency; compact?: boolean; onRatesUpdated: (currencies: Currency[]) => void }
type CurrencyQuote = { rate: number | null; updatedAt: string | null; source: string }
type CurrencyCode = 'USD' | 'EUR' | 'BRL'

const QUOTED_CURRENCIES: { code: CurrencyCode; name: string; flag: string }[] = [
  { code: 'USD', name: 'Dólar estadounidense', flag: '🇺🇸' },
  { code: 'EUR', name: 'Euro', flag: '🇪🇺' },
  { code: 'BRL', name: 'Real brasileño', flag: '🇧🇷' },
]

function localRateToBob(code: CurrencyCode, currencies: Currency[], baseCurrency?: Currency): number | null {
  const currency = currencies.find((item) => item.code.toUpperCase() === code)
  const bob = currencies.find((item) => item.code.toUpperCase() === 'BOB') ?? baseCurrency
  if (!currency) return null
  const sourceRate = getCurrencyRateToBase(currency.id, currencies)
  const bobRate = bob ? getCurrencyRateToBase(bob.id, currencies) : null
  if (sourceRate == null || bobRate == null || sourceRate <= 0 || bobRate <= 0) return null
  const rate = roundExchangeRate(sourceRate / bobRate)
  return Number.isFinite(rate) && rate > 0 ? rate : null
}

function money(value: number, code: string) {
  return `${code} ${roundExchangeRate(value).toFixed(2)}`
}

export default function CurrencyTicker({ currencies, baseCurrency, compact = false, onRatesUpdated }: Props) {
  const [quotes, setQuotes] = useState<Record<CurrencyCode, CurrencyQuote>>({
    USD: { rate: null, updatedAt: null, source: '—' },
    EUR: { rate: null, updatedAt: null, source: '—' },
    BRL: { rate: null, updatedAt: null, source: '—' },
  })
  const [loading, setLoading] = useState(true)

  const currencyKey = currencies.map((currency) => {
    const configuredRate = currency.rateSource?.startsWith('Estimado') ? 'needs-cross-rate' : currency.rateToBase ?? 'needs-cross-rate'
    return `${currency.id}:${currency.code}:${configuredRate}`
  }).join('|')
  const fetchQuotes = useCallback(async () => {
    const officialSnapshot = await getOfficialBcbRates()
    const resolvedCurrencies = await applyCurrencyRates(currencies)
    onRatesUpdated(resolvedCurrencies)
    const entries = QUOTED_CURRENCIES.map(({ code }) => {
      const currency = resolvedCurrencies.find((item) => item.code.toUpperCase() === code)
      const isManualOverride = currency?.rateSource?.toLowerCase().includes('manual') === true
      const officialRate = isManualOverride ? undefined : officialSnapshot?.rates[code]
      const localRate = typeof officialRate === 'number' && officialRate > 0
        ? roundExchangeRate(officialRate)
        : localRateToBob(code, resolvedCurrencies, baseCurrency)
      if (localRate !== null) {
        const quote: CurrencyQuote = {
          rate: roundExchangeRate(localRate),
          updatedAt: officialRate ? officialSnapshot?.rateDate ?? null : currency?.rateUpdatedAt ?? null,
          source: officialRate
            ? officialSnapshot?.stale ? 'BCB Bolivia · caché' : 'BCB Bolivia · AllRatesToday'
            : currency?.rateSource ?? 'Catálogo',
        }
        try {
          localStorage.setItem(`finora-official-currency-${code}-BOB`, JSON.stringify(quote))
        } catch {
          // Catalog rates remain available for the current session.
        }
        return [code, quote] as const
      }

      try {
        const cached = localStorage.getItem(`finora-official-currency-${code}-BOB`)
        if (cached) {
          const parsed = JSON.parse(cached) as { rate?: unknown; updatedAt?: unknown; source?: unknown }
          if (typeof parsed.rate === 'number' && Number.isFinite(parsed.rate) && parsed.rate > 0) {
            return [code, {
              rate: roundExchangeRate(parsed.rate),
              updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
              source: 'Caché',
            }] as const
          }
        }
      } catch {
        // Ignore inaccessible or malformed local cache and show no quote.
      }
      return [code, { rate: null, updatedAt: null, source: '—' }] as const
    })
    return Object.fromEntries(entries) as Record<CurrencyCode, CurrencyQuote>
  }, [currencies, baseCurrency, onRatesUpdated])

  useEffect(() => {
    let active = true
    const loadQuotes = () => {
      void fetchQuotes().then((nextQuotes) => {
        if (active) {
          setQuotes(nextQuotes)
          setLoading(false)
        }
      })
    }
    loadQuotes()
    const intervalId = window.setInterval(loadQuotes, 30 * 60 * 1000)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  // The key changes for catalog edits, but not when an API estimate is hydrated.
  // This avoids refetching in a render loop after publishing the resolved rates.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [currencyKey])

  const refresh = async () => {
    setLoading(true)
    const nextQuotes = await fetchQuotes()
    setQuotes(nextQuotes)
    setLoading(false)
  }
  const updateLabel = loading
    ? 'Actualizando…'
    : Object.values(quotes).some((quote) => quote.source.includes('caché') || quote.source === 'Caché') ? 'Últimas tasas oficiales guardadas'
      : Object.values(quotes).some((quote) => quote.source.includes('Estimado')) ? 'BCB Bolivia · fallback estimado'
        : 'Tasas oficiales del BCB de Bolivia'

  return (
    <section className={`currency-ticker ${compact ? 'currency-ticker-compact' : ''}`} aria-label="Indicadores de divisas respecto al boliviano">
      {!compact && <div className="currency-ticker-label"><span><TrendingUp size={13} /></span><strong>Divisas</strong><small>vs. BOB</small></div>}
      <div className="currency-ticker-items">
        {QUOTED_CURRENCIES.map(({ code, name, flag }) => {
          const quote = quotes[code]
          const inverse = quote.rate ? 1 / quote.rate : null
          const tooltip = quote.rate
            ? `1 ${flag} ${code} = BS ${money(quote.rate, 'BOB')} · 1 🇧🇴 BOB = ${money(inverse!, code)} · ${quote.source}${quote.updatedAt ? ` · Publicación ${quote.updatedAt}` : ''}`
            : loading ? 'Calculando tasa con los datos disponibles…' : 'Configura una tasa en Catálogos o revisa la conexión.'
          return <div className="currency-ticker-item" key={code} title={`${name}. ${tooltip}`}>
            <span className="currency-ticker-pair"><i className="ticker-flag">{flag}</i>{code}<i>/</i><i className="ticker-flag">🇧🇴</i></span>
            <strong>{quote.rate === null ? loading ? 'Calculando…' : 'No disponible' : `BS ${roundExchangeRate(quote.rate).toFixed(2)}`}</strong>
            <small className={quote.source.includes('Estimado') || quote.source === 'Caché' ? 'ticker-fallback' : quote.source.includes('BCB Bolivia') ? 'ticker-api' : ''}>{loading ? 'Cargando' : quote.source === '—' ? 'Sin configurar' : quote.source}</small>
          </div>
        })}
      </div>
      <a className="currency-ticker-attribution" href="https://allratestoday.com/central-bank-rates-api/bcbol/" target="_blank" rel="noreferrer" aria-label="Fuente de tasas oficiales: Banco Central de Bolivia vía AllRatesToday" title="Tasas oficiales del Banco Central de Bolivia, servidas por AllRatesToday">BCB</a>
      {!compact && <span className="currency-ticker-updated">{updateLabel}</span>}
      <button type="button" className="currency-ticker-refresh" onClick={() => void refresh()} disabled={loading} aria-label="Actualizar tipos de cambio" title="Actualizar tipos de cambio">
        <RefreshCw size={13} className={loading ? 'is-spinning' : ''} />
      </button>
    </section>
  )
}
