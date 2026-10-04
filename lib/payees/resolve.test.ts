import { describe, expect, it } from 'vitest'
import { resolvePayee } from './resolve'

const maria = { id: 'm', name: 'Maria Adams', relationship: 'Granddaughter', aliases: ['Maria', 'my granddaughter'] }
const joe = { id: 'j', name: "Joe's Plumbing", relationship: 'Plumber', aliases: ['Joe', 'the plumber'] }
const linda = { id: 'l', name: 'Linda Park', relationship: 'Neighbor', aliases: ['Linda'] }
const payees = [maria, joe, linda]

describe('resolvePayee', () => {
  it.each([
    ['Maria', maria],
    ['maria adams', maria],
    ['my granddaughter', maria],
    ["Joe's Plumbing", joe],
    ['Joes plumbing', joe],
    ['joe', joe],
    ['the plumber', joe],
    ['Linda', linda],
    ['my neighbor', linda],
  ])('resolves "%s"', (spoken, expected) => {
    expect(resolvePayee(spoken, payees)).toEqual({ kind: 'match', payee: expected })
  })

  it('returns none for someone not on the list', () => {
    expect(resolvePayee('Kevin', payees)).toEqual({ kind: 'none' })
    expect(resolvePayee('my grandson Kevin', payees)).toEqual({ kind: 'none' })
  })

  it('does not match on partial names', () => {
    expect(resolvePayee('Mari', payees)).toEqual({ kind: 'none' })
    expect(resolvePayee('Maria Lopez', payees)).toEqual({ kind: 'none' })
  })

  it('returns none for empty input', () => {
    expect(resolvePayee('  ', payees)).toEqual({ kind: 'none' })
  })

  it('reports ambiguity instead of guessing', () => {
    const maria2 = { id: 'm2', name: 'Maria Lopez', relationship: 'Friend', aliases: [] }
    expect(resolvePayee('Maria', [...payees, maria2])).toEqual({ kind: 'ambiguous', candidates: [maria, maria2] })
  })
})
