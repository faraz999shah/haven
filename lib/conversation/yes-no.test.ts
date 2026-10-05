import { describe, expect, it } from 'vitest'
import { interpretYesNo } from './yes-no'

describe('interpretYesNo', () => {
  it.each(['Yes', 'yes please', 'Yeah.', 'yep', 'Sure', 'OK', 'okay, send it', 'Go ahead', "That's right", 'Correct!'])(
    '"%s" → yes',
    (t) => expect(interpretYesNo(t)).toBe('yes'),
  )

  it.each(['No', 'nope', "Don't send it", 'cancel', 'Wait', 'hold on', 'never mind', 'yes, wait, no', "I'm not sure"])(
    '"%s" → no',
    (t) => expect(interpretYesNo(t)).toBe('no'),
  )

  it.each(['', '   ', 'hmm', 'Maria', 'what did you say?', 'I think so maybe'])('"%s" → unclear', (t) =>
    expect(interpretYesNo(t)).toBe('unclear'),
  )

  it('handles curly apostrophes from speech recognition', () => {
    expect(interpretYesNo('don’t')).toBe('no')
  })

  it('does not treat "no problem" as a no', () => {
    expect(interpretYesNo('Sure, no problem')).toBe('yes')
  })
})
