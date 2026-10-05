import { transcribeAudio } from '@/lib/ai/llm'
import { clientIp, createRateLimiter } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const perIp = createRateLimiter(20, 60_000)
const siteWide = createRateLimiter(300, 60 * 60_000)
const MAX_BYTES = 5 * 1024 * 1024 // well over a minute of compressed speech

// Turns a short voice recording into text when the browser can't do it itself.
export async function POST(req: Request) {
  if (!perIp(clientIp(req)) || !siteWide('all')) {
    return Response.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 })
  }
  const form = await req.formData().catch(() => null)
  const audio = form?.get('audio')
  if (!(audio instanceof File) || audio.size === 0) {
    return Response.json({ error: 'Send an audio recording' }, { status: 400 })
  }
  if (audio.size > MAX_BYTES) return Response.json({ error: 'Recording is too long' }, { status: 413 })
  try {
    return Response.json({ text: await transcribeAudio(audio) })
  } catch (err) {
    console.error('Transcription failed:', err)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
