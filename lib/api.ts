import { PaymentStateError } from '@/lib/payments/payouts-service'

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Turns service errors into JSON responses; anything unexpected is logged and hidden.
export function errorResponse(err: unknown): Response {
  if (err instanceof PaymentStateError) {
    return Response.json({ error: err.message }, { status: err.payment ? 409 : 404 })
  }
  console.error(err)
  return Response.json({ error: 'Something went wrong' }, { status: 500 })
}
