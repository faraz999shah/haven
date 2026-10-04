export interface TranscriptTurn {
  role: 'senior' | 'haven'
  text: string
}

// Renders the conversation for a prompt. Speech is untrusted, so tag-like text that could
// fake the end of the transcript block is neutralized.
export function formatTranscript(turns: TranscriptTurn[]): string {
  return turns
    .map((t) => `${t.role === 'senior' ? 'Senior' : 'Haven'}: ${t.text.replace(/<\/?\s*transcript\s*>/gi, '').trim()}`)
    .join('\n')
}
