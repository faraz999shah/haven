import { afterEach, describe, expect, it } from 'vitest'
import { hardcodedScamSource } from './hardcoded-source'
import { checkScamList, setScamSource, type ScamSource } from './index'

describe('checkScamList', () => {
  afterEach(() => setScamSource(hardcodedScamSource))

  it('returns null for an ordinary payee', async () => {
    expect(await checkScamList({ name: 'Maria Adams', email: 'maria.adams@example.com' })).toBeNull()
  })

  it('matches names regardless of case and punctuation', async () => {
    const hit = await checkScamList({ name: '  prize-claim CENTER ' })
    expect(hit).toMatchObject({ matchedOn: 'name', source: 'haven-hardcoded-list' })
  })

  it('matches emails case-insensitively', async () => {
    expect(await checkScamList({ email: 'IRS.Payments.Dept@Example.net' })).toMatchObject({ matchedOn: 'email' })
  })

  it('matches phone numbers in any format, with or without country code', async () => {
    for (const phone of ['555-010-0199', '(555) 010-0199', '+1 555 010 0199', '15550100199']) {
      expect(await checkScamList({ phone })).toMatchObject({ matchedOn: 'phone', value: '5550100199' })
    }
  })

  it('ignores empty fields', async () => {
    expect(await checkScamList({ name: '', email: null, phone: undefined })).toBeNull()
  })

  it('delegates to a swapped-in source without changing callers', async () => {
    const seen: unknown[] = []
    const fake: ScamSource = {
      name: 'fake',
      async lookup(input) {
        seen.push(input)
        return { matchedOn: 'email', value: input.email!, source: 'fake' }
      },
    }
    setScamSource(fake)
    expect(await checkScamList({ name: "Joe's Plumbing", email: ' A@B.com ' })).toEqual({
      matchedOn: 'email',
      value: 'a@b.com',
      source: 'fake',
    })
    expect(seen).toEqual([{ name: 'joes plumbing', email: 'a@b.com', phone: null }])
  })
})
