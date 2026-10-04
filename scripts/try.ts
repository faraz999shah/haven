// Talk to Haven's pipeline in the terminal (real OpenAI + local database). Nothing is saved or sent.
//   npm run try
//   npm run try -- "Send Maria $85 for groceries"

import 'dotenv/config'
import readline from 'node:readline/promises'
import { parseRequest, type PaymentDraft } from '@/lib/ai/parse'
import type { TranscriptTurn } from '@/lib/ai/transcript'
import { createDb } from '@/lib/db/client'
import { DEMO_SENIOR_ID } from '@/lib/demo'
import { assessPayment } from '@/lib/pipeline/assess'

async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL!)
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const transcript: TranscriptTurn[] = []
  let draft: PaymentDraft = { payeeName: null, amountCents: null, purpose: null }
  let followUpsAsked = 0
  let next: string | undefined = process.argv.slice(2).join(' ') || undefined

  for (;;) {
    const text = next ?? (await rl.question('\nMargaret: ').catch(() => ''))
    next = undefined
    if (!text.trim()) break
    if (process.argv.length > 2 && transcript.length === 0) console.log(`\nMargaret: ${text}`)
    transcript.push({ role: 'senior', text })

    const parsed = await parseRequest(transcript, draft)
    draft = parsed.draft
    if (parsed.kind === 'clarify') {
      console.log(`Haven: ${parsed.question}`)
      transcript.push({ role: 'haven', text: parsed.question })
      continue
    }

    const result = await assessPayment(db, {
      seniorId: DEMO_SENIOR_ID,
      draft: parsed.draft,
      transcript,
      followUpsAsked,
    })
    if (result.kind === 'clarify_payee') {
      console.log(`Haven: ${result.question}`)
      transcript.push({ role: 'haven', text: result.question })
      continue
    }

    console.log(`Haven: ${result.reply}`)
    console.log('\n  payee   :', result.payee.name, result.payee.trustedPayeeId ? '(trusted)' : '(not trusted)')
    console.log('  rules   :', result.rules.verdict, result.rules.triggered.map((t) => t.code).join(', ') || '')
    console.log(
      '  ai      :',
      result.ai.ok
        ? `${result.ai.assessment.risk_level} [${result.ai.assessment.signals.join(', ')}]`
        : `FAILED: ${result.ai.error}`,
    )
    console.log(
      '  decision:',
      result.decision.action,
      result.decision.riskLevel,
      'source' in result.decision ? `(${result.decision.source})` : '',
    )
    console.log('  reason  :', result.decision.reason)

    if (result.decision.action !== 'ask') break
    transcript.push({ role: 'haven', text: result.reply })
    followUpsAsked++
  }
  rl.close()
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
