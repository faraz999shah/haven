import { normalizeEmail, normalizeName, normalizePhone } from './normalize'
import type { NormalizedScamInput, ScamMatch, ScamSource } from './types'

// Demo data only: fictional payees in the style of real reported scams.
const KNOWN_SCAMS: { kind: 'name' | 'email' | 'phone'; value: string; note: string }[] = [
  { kind: 'name', value: 'Federal Tax Resolution Center', note: 'Impersonates the IRS and demands gift cards' },
  { kind: 'name', value: 'Medicare Benefits Renewal Office', note: 'Fake Medicare renewal fee' },
  { kind: 'name', value: 'Prize Claim Center', note: 'Lottery or sweepstakes fee scam' },
  { kind: 'name', value: 'Quick Bail Bonds Services', note: 'Grandparent bail scam' },
  { kind: 'email', value: 'irs.payments.dept@example.net', note: 'Impersonates the IRS' },
  { kind: 'email', value: 'bail.bonds.fast@example.net', note: 'Grandparent bail scam' },
  { kind: 'email', value: 'secure.bank.verify@example.org', note: 'Fake bank fraud department' },
  { kind: 'phone', value: '555-010-0199', note: 'Reported for bank impersonation calls' },
  { kind: 'phone', value: '555-010-0147', note: 'Reported for grandparent scam calls' },
]

const normalizers = { name: normalizeName, email: normalizeEmail, phone: normalizePhone }
const index = new Map(KNOWN_SCAMS.map((s) => [`${s.kind}:${normalizers[s.kind](s.value)}`, s]))

export const hardcodedScamSource: ScamSource = {
  name: 'haven-hardcoded-list',
  async lookup(input: NormalizedScamInput): Promise<ScamMatch | null> {
    for (const kind of ['email', 'phone', 'name'] as const) {
      const value = input[kind]
      if (!value) continue
      const hit = index.get(`${kind}:${value}`)
      if (hit) return { matchedOn: kind, value, source: this.name, note: hit.note }
    }
    return null
  },
}
