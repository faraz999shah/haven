export interface ScamCheckInput {
  name?: string | null
  email?: string | null
  phone?: string | null
}

export interface ScamMatch {
  matchedOn: 'name' | 'email' | 'phone'
  value: string // the normalized value that matched
  source: string // which data source reported it
  note?: string // why it is listed, for the caregiver
}

// Implement this to plug in a real data source (an API, a database table, a shared blocklist).
// Callers only ever use checkScamList(), so swapping sources needs no caller changes.
export interface ScamSource {
  readonly name: string
  lookup(input: NormalizedScamInput): Promise<ScamMatch | null>
}

export interface NormalizedScamInput {
  name: string | null
  email: string | null
  phone: string | null
}
