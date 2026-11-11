import type { Currency, Movement } from '../types/finance'

type ExchangeRateApiResponse = {
  result?: unknown
  rates?: unknown
}

export async function fetchCurrentExchangeRate(sourceCode: string, targetCode: string): Promise<number> {
  const source = sourceCode.trim().toUpperCase()
  const target = targetCode.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(source) || !/^[A-Z]{3}$/.test(target)) {
    throw new Error('La divisa de origen o destino no tiene un código ISO válido.')
  }
  if (source === target) return 1

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
  return rate
}

export function getCurrencyRateToBase(currencyId: string, currencies: Currency[]): number | null {
  const currency = currencies.find((item) => item.id === currencyId)
  if (!currency) return null
  const rate = currency.isBase ? 1 : currency.rateToBase
  return rate !== null && Number.isFinite(rate) && rate > 0 ? rate : null
}

export function convertAmount(amount: number, rateToBase: number, targetRateToBase: number): number {
  if (!Number.isFinite(rateToBase) || rateToBase <= 0) {
    throw new Error('El tipo de cambio de origen debe ser mayor que cero.')
  }
  if (!Number.isFinite(targetRateToBase) || targetRateToBase <= 0) {
    throw new Error('El tipo de cambio de la moneda de reporte debe ser mayor que cero.')
  }
  return amount * rateToBase / targetRateToBase
}

export function movementRateToBase(movement: Movement, currencies: Currency[]): number | null {
  const rate = movement.exchangeRate ?? getCurrencyRateToBase(movement.currencyId, currencies)
  return rate !== null && Number.isFinite(rate) && rate > 0 ? rate : null
}
