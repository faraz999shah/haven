// Interprets the senior's spoken answer to "Send $85 to Maria?" with plain code, not AI.
// Anything that sounds like "no" wins, so a mixed or hesitant answer never sends money.

export type YesNo = 'yes' | 'no' | 'unclear'

const NO = /\b(no|nope|nah|don'?t|do not|cancel|stop|wait|hold on|never ?mind|not)\b/
const YES =
  /^(yes|yeah|yep|yup|ya|sure|ok|okay|correct|right|please|go ahead|send it|do it|that'?s right|absolutely|of course|confirm)\b/

export function interpretYesNo(text: string): YesNo {
  const t = text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/no problem/g, '')
    .replace(/[^a-z' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t) return 'unclear'
  if (NO.test(t)) return 'no'
  if (YES.test(t)) return 'yes'
  return 'unclear'
}
