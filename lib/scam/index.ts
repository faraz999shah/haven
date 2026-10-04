import { hardcodedScamSource } from './hardcoded-source'
import { normalizeEmail, normalizeName, normalizePhone } from './normalize'
import type { ScamCheckInput, ScamMatch, ScamSource } from './types'

export type { ScamCheckInput, ScamMatch, ScamSource } from './types'

let activeSource: ScamSource = hardcodedScamSource

// Swap in a real data source at startup (or in tests).
export function setScamSource(source: ScamSource): void {
  activeSource = source
}

export async function checkScamList(payee: ScamCheckInput): Promise<ScamMatch | null> {
  return activeSource.lookup({
    name: payee.name ? normalizeName(payee.name) || null : null,
    email: payee.email ? normalizeEmail(payee.email) || null : null,
    phone: payee.phone ? normalizePhone(payee.phone) || null : null,
  })
}
