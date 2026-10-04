export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// Digits only; drops a leading US country code so "+1 (555) 010-0199" and "555-010-0199" match.
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}
