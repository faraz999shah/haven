import fs from 'node:fs'
import path from 'node:path'

const cache = new Map<string, string>()

// System prompts live in /prompts as Markdown so they can be tuned without touching code.
// Re-read on every call in development so edits apply without a restart.
export function loadPrompt(name: 'parse' | 'risk'): string {
  const cached = cache.get(name)
  if (cached && process.env.NODE_ENV === 'production') return cached
  const text = fs.readFileSync(path.join(process.cwd(), 'prompts', `${name}.md`), 'utf8')
  cache.set(name, text)
  return text
}
