import { describe, expect, it } from 'vitest'
import type { RiskOutcome } from '@/lib/ai/risk'
import type { RulesResult } from '@/lib/rules/engine'
import { combine, MAX_FOLLOW_UPS } from './combine'

const PASS: RulesResult = { verdict: 'PASS', triggered: [] }
const HOLD: RulesResult = {
  verdict: 'HOLD',
  triggered: [{ code: 'MAX_SINGLE', message: '$350 is over the $200 single-payment limit.' }],
}

const ai = (risk_level: 'low' | 'medium' | 'high', next_question: string | null = null): RiskOutcome => ({
  ok: true,
  assessment: { risk_level, reason: `AI says ${risk_level}`, signals: [], next_question },
})
const AI_FAILED: RiskOutcome = { ok: false, error: 'timeout' }

const allAiOutcomes: [string, RiskOutcome][] = [
  ['low', ai('low')],
  ['medium with question', ai('medium', 'Have you met them?')],
  ['medium without question', ai('medium')],
  ['high', ai('high')],
  ['failure', AI_FAILED],
]

describe('combine', () => {
  describe('rules HOLD always wins', () => {
    it.each(allAiOutcomes)('AI %s → hold (high)', (_, outcome) => {
      for (const followUpsAsked of [0, 1, 2]) {
        const d = combine({ rules: HOLD, ai: outcome, followUpsAsked })
        expect(d).toMatchObject({ action: 'hold', riskLevel: 'high', source: 'rules' })
      }
    })

    it("uses the AI's plain-language reason when available, else the rule messages", () => {
      expect(combine({ rules: HOLD, ai: ai('low'), followUpsAsked: 0 }).reason).toBe('AI says low')
      expect(combine({ rules: HOLD, ai: AI_FAILED, followUpsAsked: 0 }).reason).toBe(
        '$350 is over the $200 single-payment limit.',
      )
    })
  })

  describe('rules PASS uses the AI level', () => {
    it('low → confirm', () => {
      expect(combine({ rules: PASS, ai: ai('low'), followUpsAsked: 0 })).toEqual({
        action: 'confirm',
        riskLevel: 'low',
        reason: 'AI says low',
      })
    })

    it('high → hold', () => {
      expect(combine({ rules: PASS, ai: ai('high'), followUpsAsked: 0 })).toMatchObject({
        action: 'hold',
        source: 'ai',
      })
    })

    it('AI failure → hold', () => {
      expect(combine({ rules: PASS, ai: AI_FAILED, followUpsAsked: 0 })).toMatchObject({
        action: 'hold',
        riskLevel: 'high',
        source: 'ai_error',
      })
    })
  })

  describe('medium follow-ups', () => {
    it(`asks the AI's question for the first ${MAX_FOLLOW_UPS} rounds`, () => {
      for (let n = 0; n < MAX_FOLLOW_UPS; n++) {
        expect(combine({ rules: PASS, ai: ai('medium', 'Have you met Grace?'), followUpsAsked: n })).toEqual({
          action: 'ask',
          riskLevel: 'medium',
          reason: 'AI says medium',
          question: 'Have you met Grace?',
        })
      }
    })

    it(`escalates to high when still medium after ${MAX_FOLLOW_UPS} follow-ups`, () => {
      const d = combine({ rules: PASS, ai: ai('medium', 'Another question?'), followUpsAsked: MAX_FOLLOW_UPS })
      expect(d).toMatchObject({ action: 'hold', riskLevel: 'high', source: 'escalation' })
      expect(d.reason).toContain('Still unclear after 2 follow-up questions')
    })

    it('escalates when medium comes without a usable question', () => {
      expect(combine({ rules: PASS, ai: ai('medium', '   '), followUpsAsked: 0 })).toMatchObject({
        action: 'hold',
        source: 'escalation',
      })
    })

    it('a low answer after a follow-up confirms', () => {
      expect(combine({ rules: PASS, ai: ai('low'), followUpsAsked: 1 }).action).toBe('confirm')
    })
  })
})
