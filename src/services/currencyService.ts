import type { Currency, Movement } from '../types/finance'

type ExchangeRateApiResponse = {
  result?: unknown
  rates?: unknown
  time_last_update_utc?: unknown
}

type CentralBankRateRow = { base?: unknown; quote?: unknown; type?: unknown; value?: unknown; derived?: unknown }
type CentralBankRatesResponse = { bank?: unknown; rate_date?: unknown; rates?: unknown }
type CentralBankSnapshot = { rateDate: string; rates: Partial<Record<'USD' | 'EUR' | 'BRL', number>> }

const BCB_CACHE_KEY = 'finora-bcb-official-rates'
const BCB_RATES_URL = 'https://allratestoday.com/api/open/central-bank/bcbol'
let bcbMemoryCache: { snapshot: CentralBankSnapshot; fetchedAt: number; stale: boolean } | null = null

export function roundExchangeRate(rate: number): number {
  if (!Number.isFinite(rate)) return rate
  return Math.round((rate + Number.EPSILON) * 100) / 100
}

export const DEFAULT_USD_BOB_RATE = 11.71

const CROSS_RATE_CACHE_KEY = 'finora-usd-cross-rates-bob'

type CrossRateCache = {
  updatedAt: string
  rates: { EUR: number; BRL: number }
}

let inMemoryCrossRateCache: { value: CrossRateCache; fetchedAt: number } | null = null

function isValidCrossRateCache(value: unknown): value is CrossRateCache {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  const rates = record.rates
  if (typeof record.updatedAt !== 'string' || Number.isNaN(Date.parse(record.updatedAt)) || !rates || typeof rates !== 'object') return false
  const entries = rates as Record<string, unknown>
  return ['EUR', 'BRL'].every((code) => typeof entries[code] === 'number' && Number.isFinite(entries[code]) && (entries[code] as number) > 0)
}

function parseCentralBankSnapshot(value: unknown): CentralBankSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const payload = value as CentralBankRatesResponse
  const cached = value as Partial<CentralBankSnapshot>
  if (typeof cached.rateDate === 'string' && !Number.isNaN(Date.parse(cached.rateDate)) && cached.rates && typeof cached.rates === 'object') {
    const rates: CentralBankSnapshot['rates'] = {}
    for (const code of ['USD', 'EUR', 'BRL'] as const) {
      const rate = cached.rates[code]
      if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) rates[code] = roundExchangeRate(rate)
    }
    return Object.keys(rates).length ? { rateDate: cached.rateDate, rates } : null
  }
  if (payload.bank !== 'bcbol') return null
  if (!Array.isArray(payload.rates) || typeof payload.rate_date !== 'string' || Number.isNaN(Date.parse(payload.rate_date))) return null
  const rates: CentralBankSnapshot['rates'] = {}
  for (const row of payload.rates as CentralBankRateRow[]) {
    const code = typeof row.base === 'string' ? row.base.toUpperCase() : ''
    if (!['USD', 'EUR', 'BRL'].includes(code) || String(row.quote).toUpperCase() !== 'BOB') continue
    if (row.derived === true || (row.type != null && row.type !== 'reference')) continue
    const rate = typeof row.value === 'number' ? row.value : Number(row.value)
    if (Number.isFinite(rate) && rate > 0) rates[code as 'USD' | 'EUR' | 'BRL'] = roundExchangeRate(rate)
  }
  if (Object.keys(rates).length === 0) return null
  return { rateDate: payload.rate_date, rates }
}

function readCentralBankCache(): CentralBankSnapshot | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(BCB_CACHE_KEY) ?? 'null')
    return parseCentralBankSnapshot(value)
  } catch (error) {
    console.warn('No se pudo leer la caché local de tasas oficiales del BCB.', error)
    return null
  }
}

async function getCentralBankSnapshot(): Promise<{ snapshot: CentralBankSnapshot; stale: boolean } | null> {
  const memoryCache = bcbMemoryCache
  if (memoryCache && Date.now() - memoryCache.fetchedAt < 30 * 60 * 1000) {
    return { snapshot: memoryCache.snapshot, stale: memoryCache.stale }
  }
  const cachedSnapshot = readCentralBankCache()
  try {
    const response = await fetch(BCB_RATES_URL, { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`AllRatesToday respondió ${response.status}.`)
    const snapshot = parseCentralBankSnapshot(await response.json())
    if (!snapshot) throw new Error('AllRatesToday no devolvió tasas oficiales válidas del BCB de Bolivia.')
    bcbMemoryCache = { snapshot, fetchedAt: Date.now(), stale: false }
    try {
      localStorage.setItem(BCB_CACHE_KEY, JSON.stringify(snapshot))
    } catch {
      // The official rates remain available in memory for this session.
    }
    return { snapshot, stale: false }
  } catch (error) {
    console.warn('No se pudieron actualizar las tasas oficiales del BCB; se usará la caché y luego Catálogos.', error)
    if (cachedSnapshot) {
      bcbMemoryCache = { snapshot: cachedSnapshot, fetchedAt: Date.now(), stale: true }
      return { snapshot: cachedSnapshot, stale: true }
    }
    return null
  }
}

export async function getOfficialBcbRates(): Promise<{ rateDate: string; rates: Partial<Record<'USD' | 'EUR' | 'BRL', number>>; stale: boolean } | null> {
  const result = await getCentralBankSnapshot()
  return result ? { ...result.snapshot, stale: result.stale } : null
}

export async function fetchCurrentExchangeRateQuote(sourceCode: string, targetCode: string): Promise<{ rate: number; updatedAt: string }> {
  const source = sourceCode.trim().toUpperCase()
  const target = targetCode.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(source) || !/^[A-Z]{3}$/.test(target)) {
    throw new Error('La divisa de origen o destino no tiene un código ISO válido.')
  }
  if (source === target) return { rate: 1, updatedAt: new Date().toISOString() }

  const response = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(source)}`)
  if (!response.ok) throw new Error(`La API de tipos de cambio respondió ${response.status}.`)
  const payload = await response.json() as ExchangeRateApiResponse
  if (payload.result !== 'success' || !payload.rates || typeof payload.rates !== 'object') {
    throw new Error('La API no devolvió una cotización válida.')
  }
  const rate = (payload.rates as Record<string, unknown>)[target]
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`No hay una cotización disponible de ${source} a ${target}.`)
  }
  const updatedAt = typeof payload.time_last_update_utc === 'string'
    ? new Date(payload.time_last_update_utc).toISOString()
    : new Date().toISOString()
  return { rate: roundExchangeRate(rate), updatedAt }
}

export async function fetchCurrentExchangeRate(sourceCode: string, targetCode: string): Promise<number> {
  const quote = await fetchCurrentExchangeRateQuote(sourceCode, targetCode)
  return quote.rate
}

async function applyCrossRateFallback(currencies: Currency[]): Promise<Currency[]> {
  const bobCurrency = currencies.find((currency) => currency.code.toUpperCase() === 'BOB')
  if (!bobCurrency) return currencies
  const bobToBase = bobCurrency.isBase ? 1 : bobCurrency.rateToBase
  if (bobToBase == null || !Number.isFinite(bobToBase) || bobToBase <= 0) return currencies
  const usdCurrency = currencies.find((currency) => currency.code.toUpperCase() === 'USD')
  const configuredUsdToBase = usdCurrency ? getCurrencyRateToBase(usdCurrency.id, currencies) : null
  const usdToBob = configuredUsdToBase == null ? DEFAULT_USD_BOB_RATE : configuredUsdToBase / bobToBase
  if (!Number.isFinite(usdToBob) || usdToBob <= 0) return currencies

  const estimatedCurrencies = currencies.filter((currency) =>
    ['EUR', 'BRL'].includes(currency.code.toUpperCase())
    && (currency.rateToBase == null || currency.rateSource?.startsWith('Estimado') === true))
  if (estimatedCurrencies.length === 0) return currencies

  const memoryCache = inMemoryCrossRateCache
  const hasFreshMemoryCache = memoryCache !== null && Date.now() - memoryCache.fetchedAt < 30 * 60 * 1000
  let crossRates = hasFreshMemoryCache
    ? memoryCache.value
    : null
  if (!crossRates) {
    try {
      const cached = localStorage.getItem(CROSS_RATE_CACHE_KEY)
      if (cached) {
        const parsed: unknown = JSON.parse(cached)
        if (isValidCrossRateCache(parsed)) crossRates = parsed
      }
    } catch (error) {
      console.warn('No se pudo leer la caché local de tasas cruzadas EUR/BRL.', error)
    }
  }
  const cacheIsFresh = hasFreshMemoryCache || Boolean(crossRates && Date.now() - Date.parse(crossRates.updatedAt) < 30 * 60 * 1000)
  if (cacheIsFresh && crossRates) inMemoryCrossRateCache = { value: crossRates, fetchedAt: Date.now() }

  if (!cacheIsFresh) {
    try {
      const response = await fetch('https://open.er-api.com/v6/latest/USD')
      if (!response.ok) throw new Error(`La API de cotizaciones respondió ${response.status}.`)
      const payload = await response.json() as ExchangeRateApiResponse
      if (payload.result !== 'success' || !payload.rates || typeof payload.rates !== 'object') {
        throw new Error('La API no devolvió cotizaciones USD válidas.')
      }
      const rates = payload.rates as Record<string, unknown>
      const eurPerUsd = Number(rates.EUR)
      const brlPerUsd = Number(rates.BRL)
      if (!Number.isFinite(eurPerUsd) || eurPerUsd <= 0 || !Number.isFinite(brlPerUsd) || brlPerUsd <= 0) {
        throw new Error('La API no devolvió tasas válidas para EUR y BRL.')
      }
      const updatedAt = typeof payload.time_last_update_utc === 'string'
        ? new Date(payload.time_last_update_utc).toISOString()
        : new Date().toISOString()
      crossRates = {
        updatedAt,
        rates: {
          EUR: roundExchangeRate(usdToBob / eurPerUsd),
          BRL: roundExchangeRate(usdToBob / brlPerUsd),
        },
      }
      try {
        localStorage.setItem(CROSS_RATE_CACHE_KEY, JSON.stringify(crossRates))
      } catch {
        // The fetched rates are still used in memory when local storage is unavailable.
      }
      inMemoryCrossRateCache = { value: crossRates, fetchedAt: Date.now() }
    } catch (error) {
      console.warn('No se pudieron actualizar las tasas cruzadas de EUR/BRL; se usan la caché o las tasas de Catálogos.', error)
    }
  }

  if (!crossRates) return currencies
  return currencies.map((currency) => {
    const code = currency.code.toUpperCase()
    if (!['EUR', 'BRL'].includes(code)) return currency
    const hasManualRate = currency.rateToBase !== null && currency.rateSource !== 'Estimado (cruce USD)'
    if (hasManualRate) return currency
    const rateToBob = crossRates?.rates[code as 'EUR' | 'BRL']
    if (!rateToBob || !Number.isFinite(rateToBob) || rateToBob <= 0) return currency
    return {
      ...currency,
      rateToBase: roundExchangeRate(rateToBob * bobToBase),
      rateSource: 'Estimado (cruce USD)',
      rateUpdatedAt: crossRates?.updatedAt ?? null,
    }
  })
}

export async function applyCurrencyRates(currencies: Currency[]): Promise<Currency[]> {
  const bobCurrency = currencies.find((currency) => currency.code.toUpperCase() === 'BOB')
  if (!bobCurrency) return currencies
  const bobToBase = bobCurrency.isBase ? 1 : bobCurrency.rateToBase
  if (bobToBase == null || !Number.isFinite(bobToBase) || bobToBase <= 0) return currencies

  const official = await getCentralBankSnapshot()
  const resolvedCurrencies = currencies.map((currency) => {
    const code = currency.code.toUpperCase()
    const isManualOverride = currency.rateSource?.toLowerCase().includes('manual') === true
    const rateToBob = official?.snapshot.rates[code as 'USD' | 'EUR' | 'BRL']
    if (isManualOverride || !rateToBob) {
      if (code === 'USD' && !isManualOverride && currency.rateToBase == null) {
        return {
          ...currency,
          rateToBase: roundExchangeRate(DEFAULT_USD_BOB_RATE * bobToBase),
          rateSource: 'Por defecto (USD/BOB)',
        }
      }
      return currency
    }
    return {
      ...currency,
      rateToBase: roundExchangeRate(rateToBob * bobToBase),
      rateSource: official.stale ? 'BCB Bolivia · caché' : 'BCB Bolivia · AllRatesToday',
      rateUpdatedAt: official.snapshot.rateDate,
    }
  })
  return applyCrossRateFallback(resolvedCurrencies)
}

export function getCurrencyRateToBase(currencyId: string, currencies: Currency[]): number | null {
  const currency = currencies.find((item) => item.id === currencyId)
  if (!currency) return null
  if (currency.isBase) return 1
  const configuredRate = currency.rateToBase
  if (configuredRate !== null && configuredRate !== undefined && Number.isFinite(configuredRate) && configuredRate > 0) {
    const roundedRate = roundExchangeRate(configuredRate)
    return roundedRate > 0 ? roundedRate : null
  }
  const bobCurrency = currencies.find((item) => item.code.toUpperCase() === 'BOB')
  const bobRateToBase = bobCurrency?.isBase ? 1 : bobCurrency?.rateToBase
  if (bobCurrency && bobRateToBase !== null && bobRateToBase !== undefined && Number.isFinite(bobRateToBase) && bobRateToBase > 0) {
    if (currency.code.toUpperCase() === 'BOB') return roundExchangeRate(bobRateToBase)
    if (currency.code.toUpperCase() === 'USD') return roundExchangeRate(DEFAULT_USD_BOB_RATE * bobRateToBase)
  }
  return null
}

export function convertAmount(amount: number, rateToBase: number, targetRateToBase: number): number {
  if (!Number.isFinite(rateToBase) || rateToBase <= 0) {
    throw new Error('El tipo de cambio de origen debe ser mayor que cero.')
  }
  if (!Number.isFinite(targetRateToBase) || targetRateToBase <= 0) {
    throw new Error('El tipo de cambio de la moneda de reporte debe ser mayor que cero.')
  }
  const roundedSourceRate = roundExchangeRate(rateToBase)
  const roundedTargetRate = roundExchangeRate(targetRateToBase)
  if (roundedSourceRate <= 0 || roundedTargetRate <= 0) {
    throw new Error('El tipo de cambio redondeado a dos decimales debe ser mayor que cero.')
  }
  return Math.round((amount * roundedSourceRate / roundedTargetRate + Number.EPSILON) * 100) / 100
}

export function movementRateToBase(movement: Movement, currencies: Currency[]): number | null {
  const currency = currencies.find((item) => item.id === movement.currencyId)
  if (currency?.code.toUpperCase() === 'USD') return getCurrencyRateToBase(currency.id, currencies)
  const rate = movement.exchangeRate ?? getCurrencyRateToBase(movement.currencyId, currencies)
  if (rate === null || !Number.isFinite(rate) || rate <= 0) return null
  const roundedRate = roundExchangeRate(rate)
  return roundedRate > 0 ? roundedRate : null
}
