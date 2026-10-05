// Minimal PayPal REST client: OAuth client-credentials token (cached) + JSON requests.

export class PayPalError extends Error {
  constructor(
    message: string,
    readonly status: number, // 0 = network error / timeout
    readonly body: unknown,
  ) {
    super(message)
    this.name = 'PayPalError'
  }
}

function config() {
  const clientId = process.env.PAYPAL_CLIENT_ID
  const secret = process.env.PAYPAL_CLIENT_SECRET
  if (!clientId || !secret) throw new Error('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set')
  return { clientId, secret, base: process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com' }
}

let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value
  const { clientId, secret, base } = config()
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15_000),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new PayPalError(`PayPal OAuth failed (${res.status})`, res.status, body)
  // Refresh a minute early so a token never expires mid-request.
  cachedToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 }
  return cachedToken.value
}

export async function paypalRequest<T>(method: 'GET' | 'POST', path: string, json?: unknown): Promise<T> {
  const { base } = config()
  const token = await getAccessToken()
  let res: Response
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: json === undefined ? undefined : JSON.stringify(json),
      signal: AbortSignal.timeout(20_000),
    })
  } catch (err) {
    throw new PayPalError(`PayPal request failed: ${err instanceof Error ? err.message : err}`, 0, null)
  }
  const body = await res.json().catch(() => null)
  if (res.status === 401) cachedToken = null
  if (!res.ok) {
    const detail = body?.details?.[0]?.issue || body?.message || res.statusText
    throw new PayPalError(`PayPal ${method} ${path} → ${res.status}: ${detail}`, res.status, body)
  }
  return body as T
}
