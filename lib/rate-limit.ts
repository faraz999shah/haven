// Fixed-window rate limiter kept in memory, which assumes one server process (true on Render's free plan).
export function createRateLimiter(limit: number, windowMs: number) {
  const windows = new Map<string, { start: number; count: number }>()
  return function allow(key: string, now = Date.now()): boolean {
    const w = windows.get(key)
    if (!w || now - w.start >= windowMs) {
      // Drop expired windows now and then so the map can't grow without bound.
      if (windows.size > 10_000) {
        for (const [k, v] of windows) if (now - v.start >= windowMs) windows.delete(k)
      }
      windows.set(key, { start: now, count: 1 })
      return true
    }
    if (w.count >= limit) return false
    w.count++
    return true
  }
}

// The client IP as reported by the proxy in front of the app. It can be spoofed, so a site-wide limit backs it up.
export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}
