/**
 * Convert dollars to minor units (cents) for API storage.
 * API stores monetary values as integers in minor units.
 */
export function dollarsToMinorUnits(dollars: number): number {
  return Math.round(dollars * 100)
}

/**
 * Convert minor units (cents) to dollars for display.
 */
export function minorUnitsToDollars(minorUnits: number): number {
  return minorUnits / 100
}

/**
 * Format minor units as currency for display.
 */
export function formatMoney(minorUnits: number | null, currency = 'USD'): string {
  if (minorUnits === null || minorUnits === undefined) return '—'
  const dollars = minorUnitsToDollars(minorUnits)
  return `${currency} ${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
