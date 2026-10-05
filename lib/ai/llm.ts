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
  transcribe: () => process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe',
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

// Speech to text for browsers whose built-in recognition is missing or can't reach its service.
export async function transcribeAudio(audio: File): Promise<string> {
  const result = await getClient().audio.transcriptions.create({
    model: models.transcribe(),
    file: audio,
    language: 'en',
    response_format: 'json',
  })
  return result.text.trim()
}
