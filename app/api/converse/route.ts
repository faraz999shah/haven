import { z } from 'zod'
import { handleTurn } from '@/lib/conversation/service'
import { getDb } from '@/lib/db/client'
import { DEMO_SENIOR_ID } from '@/lib/demo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z
  .object({
    conversationId: z.string().uuid().nullish(),
    text: z.string().max(1000).nullish(),
    action: z.enum(['confirm', 'cancel']).nullish(),
  })
  .refine((b) => Boolean(b.text?.trim()) || Boolean(b.action), 'Send text or an action')

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  try {
    const result = await handleTurn(getDb(), { seniorId: DEMO_SENIOR_ID, ...parsed.data })
    return Response.json(result)
  } catch (err) {
    console.error('Converse failed:', err)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
