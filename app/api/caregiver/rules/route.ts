import { errorResponse } from '@/lib/api'
import { getRules, RulesSchema, saveRules } from '@/lib/caregiver/service'
import { getDb } from '@/lib/db/client'
import { DEMO_SENIOR_ID } from '@/lib/demo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json(await getRules(getDb(), DEMO_SENIOR_ID))
}

export async function PUT(req: Request) {
  const body = RulesSchema.safeParse(await req.json().catch(() => null))
  if (!body.success) {
    const issue = body.error.issues[0]
    return Response.json({ error: `${issue?.path.join('.')}: ${issue?.message}` }, { status: 400 })
  }
  try {
    return Response.json(await saveRules(getDb(), DEMO_SENIOR_ID, body.data))
  } catch (err) {
    return errorResponse(err)
  }
}
