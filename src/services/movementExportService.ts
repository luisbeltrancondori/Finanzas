import ExcelJS from 'exceljs'
import type { Account, Currency, Movement } from '../types/finance'
import { getCurrencyRateToBase } from './currencyService'

const headerFill = 'FF256C4C'
const secondaryFill = 'FFE8F1EC'
const numberFormat = '#,##0.00;[Red]-#,##0.00'
const rateFormat = '#,##0.000000'

type SummaryTotals = { income: number; expenses: number; balance: number; balanceInReference: number }
type CurrencyTotals = SummaryTotals

function isValidRate(rate: number | null | undefined): rate is number {
  return rate !== null && rate !== undefined && Number.isFinite(rate) && rate > 0
}

function styleHeader(row: ExcelJS.Row) {
  row.height = 24
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerFill } }
  row.alignment = { vertical: 'middle', wrapText: true }
}

function addSection(
  worksheet: ExcelJS.Worksheet,
  title: string,
  columns: { header: string; key: string; width: number; numFmt?: string }[],
  rows: Record<string, string | number>[],
) {
  const titleRow = worksheet.addRow([title])
  titleRow.font = { bold: true, color: { argb: 'FF256C4C' }, size: 12 }
  titleRow.height = 22
  worksheet.mergeCells(titleRow.number, 1, titleRow.number, columns.length)
  const headerRow = worksheet.addRow(columns.map((column) => column.header))
  styleHeader(headerRow)
  const firstDataRow = headerRow.number + 1
  rows.forEach((row) => worksheet.addRow(columns.map((column) => row[column.key] ?? '')))
  columns.forEach((column, index) => {
    const sheetColumn = worksheet.getColumn(index + 1)
    sheetColumn.width = column.width
    if (column.numFmt) {
      for (let rowNumber = firstDataRow; rowNumber < firstDataRow + rows.length; rowNumber += 1) {
        worksheet.getCell(rowNumber, index + 1).numFmt = column.numFmt
      }
    }
  })
  worksheet.addRow([])
}

export async function exportMovementsToExcel(
  movements: Movement[],
  currencies: Currency[],
  accounts: Account[],
  now = new Date(),
): Promise<void> {
  const referenceCurrency = currencies.find((currency) => currency.isBase)
    ?? currencies.find((currency) => currency.code.toUpperCase() === 'BOB')
    ?? currencies[0]
  const referenceCode = referenceCurrency?.code || 'BOB'
  const referenceRate = referenceCurrency
    ? getCurrencyRateToBase(referenceCurrency.id, currencies) ?? 1
    : 1
  const currencyById = new Map(currencies.map((currency) => [currency.id, currency]))
  const accountById = new Map(accounts.map((account) => [account.id, account]))
  const movementRate = (movement: Movement) => {
    const currency = currencyById.get(movement.currencyId)
    if (currency?.isBase || currency?.id === referenceCurrency?.id || movement.currency.toUpperCase() === referenceCode.toUpperCase()) return 1
    return isValidRate(movement.exchangeRate)
      ? movement.exchangeRate
      : getCurrencyRateToBase(movement.currencyId, currencies) ?? 1
  }
  const amountInReference = (movement: Movement) => movement.amount * movementRate(movement) / referenceRate

  const movementsByAccount = new Map<string, Movement[]>()
  movements.forEach((movement) => {
    const accountMovements = movementsByAccount.get(movement.accountId) ?? []
    accountMovements.push(movement)
    movementsByAccount.set(movement.accountId, accountMovements)
  })

  const accountSummaries = accounts.map((account) => {
    const accountMovements = movementsByAccount.get(account.id) ?? []
    const income = accountMovements.filter((movement) => movement.type === 'Ingreso').reduce((sum, movement) => sum + movement.amount, 0)
    const expenses = accountMovements.filter((movement) => movement.type === 'Gasto').reduce((sum, movement) => sum + movement.amount, 0)
    const currencyRate = getCurrencyRateToBase(account.currencyId, currencies) ?? 1
    return {
      account,
      income,
      expenses,
      balanceInReference: account.balance * currencyRate / referenceRate,
    }
  })

  const currencySummaries = new Map<string, CurrencyTotals>()
  accounts.forEach((account) => {
    const current = currencySummaries.get(account.currencyId) ?? { income: 0, expenses: 0, balance: 0, balanceInReference: 0 }
    const rate = getCurrencyRateToBase(account.currencyId, currencies) ?? 1
    current.balance += account.balance
    current.balanceInReference += account.balance * rate / referenceRate
    currencySummaries.set(account.currencyId, current)
  })
  movements.forEach((movement) => {
    const current = currencySummaries.get(movement.currencyId) ?? { income: 0, expenses: 0, balance: 0, balanceInReference: 0 }
    if (movement.type === 'Ingreso') current.income += movement.amount
    else current.expenses += movement.amount
    currencySummaries.set(movement.currencyId, current)
  })

  const bankSummaries = new Map<string, SummaryTotals>()
  accounts.forEach((account) => {
    const bankName = account.bank || 'Sin banco'
    const current = bankSummaries.get(bankName) ?? { income: 0, expenses: 0, balance: 0, balanceInReference: 0 }
    const rate = getCurrencyRateToBase(account.currencyId, currencies) ?? 1
    current.balanceInReference += account.balance * rate / referenceRate
    bankSummaries.set(bankName, current)
  })
  movements.forEach((movement) => {
    const bankName = accountById.get(movement.accountId)?.bank || 'Sin banco'
    const current = bankSummaries.get(bankName) ?? { income: 0, expenses: 0, balance: 0, balanceInReference: 0 }
    const equivalent = amountInReference(movement)
    if (movement.type === 'Ingreso') current.income += equivalent
    else current.expenses += equivalent
    bankSummaries.set(bankName, current)
  })

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Finora'
  workbook.created = now

  const summarySheet = workbook.addWorksheet('Resumen Financiero')
  summarySheet.columns = [{ width: 30 }, { width: 24 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 22 }]
  summarySheet.addRow(['SISTEMA FINORA - REPORTE EJECUTIVO'])
  summarySheet.mergeCells(1, 1, 1, 6)
  summarySheet.getRow(1).height = 32
  summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 16 }
  summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerFill } }
  summarySheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'left' }
  summarySheet.addRow([`Reporte generado: ${now.toLocaleDateString('es-BO')}`, `Moneda consolidada: ${referenceCode}`, `Movimientos filtrados: ${movements.length}`])
  summarySheet.addRow([])

  const accountCurrencyRows = accountSummaries.map(({ account, income, expenses, balanceInReference }) => ({
    cuenta: account.name,
    banco: account.bank || 'Sin banco',
    moneda: account.currency || '—',
    ingresos: income,
    egresos: expenses,
    saldo: account.balance,
    consolidado: balanceInReference,
  }))
  addSection(summarySheet, 'RESUMEN DE CUENTAS', [
    { header: 'Cuenta', key: 'cuenta', width: 28 },
    { header: 'Banco', key: 'banco', width: 22 },
    { header: 'Moneda', key: 'moneda', width: 12 },
    { header: 'Ingresos (nominal)', key: 'ingresos', width: 20, numFmt: numberFormat },
    { header: 'Egresos (nominal)', key: 'egresos', width: 20, numFmt: numberFormat },
    { header: 'Saldo actual (nominal)', key: 'saldo', width: 22, numFmt: numberFormat },
    { header: `Saldo consolidado (${referenceCode})`, key: 'consolidado', width: 25, numFmt: numberFormat },
  ], accountCurrencyRows)

  const currencyRows = [...currencySummaries.entries()].map(([currencyId, totals]) => {
    const currency = currencyById.get(currencyId)
    return {
      moneda: currency?.name ?? currency?.code ?? currencyId,
      codigo: currency?.code ?? '—',
      ingresos: totals.income,
      egresos: totals.expenses,
      saldo: totals.balance,
      consolidado: totals.balanceInReference,
    }
  })
  addSection(summarySheet, 'RESUMEN POR MONEDAS', [
    { header: 'Moneda', key: 'moneda', width: 28 },
    { header: 'Código', key: 'codigo', width: 12 },
    { header: 'Ingresos (nominal)', key: 'ingresos', width: 20, numFmt: numberFormat },
    { header: 'Egresos (nominal)', key: 'egresos', width: 20, numFmt: numberFormat },
    { header: 'Saldo actual (nominal)', key: 'saldo', width: 22, numFmt: numberFormat },
    { header: `Saldo consolidado (${referenceCode})`, key: 'consolidado', width: 25, numFmt: numberFormat },
  ], currencyRows)

  const bankRows = [...bankSummaries.entries()].map(([bank, totals]) => ({
    banco: bank,
    ingresos: totals.income,
    egresos: totals.expenses,
    saldo: totals.balanceInReference,
  }))
  addSection(summarySheet, 'RESUMEN POR BANCOS', [
    { header: 'Banco', key: 'banco', width: 30 },
    { header: `Ingresos (${referenceCode})`, key: 'ingresos', width: 22, numFmt: numberFormat },
    { header: `Egresos (${referenceCode})`, key: 'egresos', width: 22, numFmt: numberFormat },
    { header: `Saldo consolidado (${referenceCode})`, key: 'saldo', width: 27, numFmt: numberFormat },
  ], bankRows)
  summarySheet.views = [{ state: 'frozen', ySplit: 1 }]

  const detailSheet = workbook.addWorksheet('Detalle de Movimientos')
  const equivalentHeader = `Importe Equivalente (${referenceCode === 'BOB' ? 'BS' : referenceCode})`
  detailSheet.columns = [
    { header: 'Fecha', key: 'date', width: 14 },
    { header: 'Descripción', key: 'description', width: 32 },
    { header: 'Categoría', key: 'category', width: 22 },
    { header: 'Cuenta', key: 'account', width: 26 },
    { header: 'Método de Pago', key: 'payment', width: 20 },
    { header: 'Tipo (Ingreso/Gasto)', key: 'type', width: 22 },
    { header: 'Importe Original', key: 'amount', width: 18 },
    { header: 'Moneda', key: 'currency', width: 12 },
    { header: 'Tasa de Cambio', key: 'rate', width: 18 },
    { header: equivalentHeader, key: 'equivalent', width: 28 },
  ]
  detailSheet.addRows(movements.map((movement) => ({
    date: new Date(`${movement.date}T00:00:00`),
    description: movement.description,
    category: movement.category,
    account: movement.account,
    payment: movement.payment,
    type: movement.type,
    amount: movement.amount,
    currency: movement.currency,
    rate: movementRate(movement),
    equivalent: amountInReference(movement),
  })))
  styleHeader(detailSheet.getRow(1))
  detailSheet.getColumn('date').numFmt = 'yyyy-mm-dd'
  detailSheet.getColumn('amount').numFmt = numberFormat
  detailSheet.getColumn('rate').numFmt = rateFormat
  detailSheet.getColumn('equivalent').numFmt = numberFormat
  detailSheet.views = [{ state: 'frozen', ySplit: 1 }]
  detailSheet.autoFilter = { from: 'A1', to: 'J1' }

  const positionSheet = workbook.addWorksheet('Saldos y Bancos')
  positionSheet.columns = [
    { header: 'Banco', key: 'bank', width: 28 },
    { header: 'Cuenta', key: 'account', width: 30 },
    { header: 'Número de Cuenta', key: 'number', width: 22 },
    { header: 'Moneda', key: 'currency', width: 12 },
    { header: 'Saldo Actual', key: 'balance', width: 20 },
    { header: `Equivalencia (${referenceCode})`, key: 'equivalent', width: 25 },
    { header: 'Estado', key: 'status', width: 14 },
  ]
  positionSheet.addRows(accounts.map((account) => {
    const accountRate = getCurrencyRateToBase(account.currencyId, currencies) ?? 1
    return {
      bank: account.bank || 'Sin banco',
      account: account.name,
      number: account.number || '—',
      currency: account.currency || '—',
      balance: account.balance,
      equivalent: account.balance * accountRate / referenceRate,
      status: account.active ? 'Activa' : 'Inactiva',
    }
  }))
  styleHeader(positionSheet.getRow(1))
  positionSheet.getColumn('balance').numFmt = numberFormat
  positionSheet.getColumn('equivalent').numFmt = numberFormat
  positionSheet.views = [{ state: 'frozen', ySplit: 1 }]
  positionSheet.autoFilter = { from: 'A1', to: 'G1' }

  for (const sheet of [detailSheet, positionSheet]) {
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && rowNumber % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F8F5' } }
        })
      }
    })
  }
  for (const row of summarySheet.getRows(1, summarySheet.rowCount) ?? []) {
    const sectionTitle = String(row.getCell(1).value ?? '')
    if (['RESUMEN DE CUENTAS', 'RESUMEN POR MONEDAS', 'RESUMEN POR BANCOS'].includes(sectionTitle)) {
      row.font = { bold: true, color: { argb: 'FF256C4C' }, size: 12 }
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: secondaryFill } }
    }
  }

  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `Finora_Reporte_Movimientos_${month}.xlsx`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
