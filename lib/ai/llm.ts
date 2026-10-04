import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import type { z } from 'zod'

export interface StructuredRequest {
  model: string
  system: string
  input: string
  schema: z.ZodTypeAny
  schemaName: string
}

// Returns the model's raw JSON (unvalidated). Callers validate it themselves so a
// misbehaving model or SDK can never hand them an unchecked object.
export type StructuredCall = (req: StructuredRequest) => Promise<unknown>

export const models = {
  parse: () => process.env.OPENAI_PARSE_MODEL || 'gpt-6-luna',
  risk: () => process.env.OPENAI_RISK_MODEL || 'gpt-6.1-sol',
}

let client: OpenAI | null = null

function getClient(): OpenAI {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set')
    client = new OpenAI({ timeout: 20_000, maxRetries: 1 })
  }
  return client
}

export const openaiStructuredCall: StructuredCall = async ({ model, system, input, schema, schemaName }) => {
  const response = await getClient().responses.create({
    model,
    instructions: system,
    input,
    text: { format: zodTextFormat(schema, schemaName) },
  })
  if (response.status !== 'completed') {
    throw new Error(`Model response ${response.status}: ${response.incomplete_details?.reason ?? 'unknown'}`)
  }
  for (const item of response.output) {
    if (item.type === 'message') {
      for (const part of item.content) {
        if (part.type === 'refusal') throw new Error(`Model refused: ${part.refusal}`)
      }
    }
  }
  return JSON.parse(response.output_text)
}
