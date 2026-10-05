// Matches the name the senior said to a trusted payee. Deterministic on purpose:
// the AI extracts what was said, but only this code decides who counts as trusted.

import { normalizeName } from '@/lib/scam/normalize'

export interface PayeeCandidate {
  id: string
  name: string
  relationship: string
  aliases: string[]
}

export type PayeeResolution<T extends PayeeCandidate> =
  { kind: 'match'; payee: T } | { kind: 'ambiguous'; candidates: T[] } | { kind: 'none' }

const FILLER = /^(my|our|the|to)\s+/

function clean(text: string): string {
  let s = normalizeName(text)
  while (FILLER.test(s)) s = s.replace(FILLER, '')
  return s
}

function keysFor(p: PayeeCandidate): Set<string> {
  const keys = new Set<string>()
  const full = clean(p.name)
  keys.add(full)
  keys.add(full.split(' ')[0]) // first name: "Maria" for "Maria Adams"
  if (p.relationship) keys.add(clean(p.relationship))
  for (const a of p.aliases) keys.add(clean(a))
  keys.delete('')
  return keys
}

export function resolvePayee<T extends PayeeCandidate>(spoken: string, payees: T[]): PayeeResolution<T> {
  const said = clean(spoken)
  if (!said) return { kind: 'none' }
  const matches = payees.filter((p) => keysFor(p).has(said))
  if (matches.length === 1) return { kind: 'match', payee: matches[0] }
  if (matches.length > 1) return { kind: 'ambiguous', candidates: matches }
  return { kind: 'none' }
}
