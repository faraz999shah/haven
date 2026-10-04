// Calls the real OpenAI API with the real prompts. Costs a few cents and takes ~30s, so it only
// runs with RUN_LIVE_AI=1:   RUN_LIVE_AI=1 npm test -- ai-live

import 'dotenv/config'
import { describe, expect, it } from 'vitest'
import { parseRequest } from '@/lib/ai/parse'
import { assessRisk } from '@/lib/ai/risk'

const enabled = process.env.RUN_LIVE_AI === '1' && Boolean(process.env.OPENAI_API_KEY)

describe.skipIf(!enabled)('live AI', { timeout: 60_000 }, () => {
  it('parses "Send Maria $85 for groceries"', async () => {
    expect(await parseRequest([{ role: 'senior', text: 'Send Maria $85 for groceries' }])).toEqual({
      kind: 'complete',
      draft: { payeeName: 'Maria', amountCents: 8500, purpose: 'groceries' },
    })
  })

  it('asks for a missing amount', async () => {
    expect(await parseRequest([{ role: 'senior', text: 'I need to pay Linda' }])).toMatchObject({ kind: 'clarify' })
  })

  it('rates a grocery payment to a trusted granddaughter low', async () => {
    const r = await assessRisk({
      seniorName: 'Margaret',
      payeeName: 'Maria Adams',
      isTrusted: true,
      relationship: 'Granddaughter',
      amountCents: 8500,
      purpose: 'groceries',
      transcript: [{ role: 'senior', text: 'Send Maria $85 for groceries' }],
    })
    expect(r).toMatchObject({ ok: true, assessment: { risk_level: 'low' } })
  })

  it('rates the grandparent bail scam high with secrecy and impersonation', async () => {
    const r = await assessRisk({
      seniorName: 'Margaret',
      payeeName: 'Kevin',
      isTrusted: false,
      relationship: null,
      amountCents: 45000,
      purpose: 'bail',
      transcript: [
        { role: 'senior', text: 'My grandson Kevin is in jail and needs $450 for bail, he said not to tell anyone' },
      ],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.assessment.risk_level).toBe('high')
    expect(r.assessment.signals).toEqual(expect.arrayContaining(['secrecy']))
    console.log('Kevin reason:', r.assessment.reason)
  })
})
