import { describe, expect, it } from 'vitest'
import { clientIp, createRateLimiter } from '@/lib/rate-limit'

describe('createRateLimiter', () => {
  it('allows up to the limit per key, then blocks until the window ends', () => {
    const allow = createRateLimiter(2, 1000)
    expect([allow('a', 0), allow('a', 10), allow('a', 20)]).toEqual([true, true, false])
    expect(allow('b', 20)).toBe(true)
    expect(allow('a', 999)).toBe(false)
    expect(allow('a', 1000)).toBe(true)
  })
})

describe('clientIp', () => {
  it('takes the first forwarded address', () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } })
    expect(clientIp(req)).toBe('1.2.3.4')
    expect(clientIp(new Request('http://x'))).toBe('unknown')
  })
})
