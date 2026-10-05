// All money is stored and computed as integer cents.

export function formatCents(cents: number): string {
  const dollars = cents / 100
  return Number.isInteger(dollars)
    ? `$${dollars.toLocaleString('en-US')}`
    : `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100)
}
