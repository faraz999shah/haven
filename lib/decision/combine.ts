// Combines Layer 1 (rules) and Layer 2 (AI) into one decision. Deterministic code.
// The stricter result always wins: the AI can raise risk but can never lower it, and any
// AI failure counts as high. Nothing the AI outputs can turn a rules HOLD into a send.

import type { RiskAssessment } from '@/lib/ai/schemas'
import type { RiskOutcome } from '@/lib/ai/risk'
import type { RulesResult } from '@/lib/rules/engine'

export const MAX_FOLLOW_UPS = 2

export type HoldSource = 'rules' | 'ai' | 'ai_error' | 'escalation'

export type Decision =
  | { action: 'confirm'; riskLevel: 'low'; reason: string }
  | { action: 'ask'; riskLevel: 'medium'; reason: string; question: string }
  | { action: 'hold'; riskLevel: 'high'; reason: string; source: HoldSource }

export interface CombineInput {
  rules: RulesResult
  ai: RiskOutcome
  followUpsAsked: number // follow-up questions already asked in this conversation
}

export function combine({ rules, ai, followUpsAsked }: CombineInput): Decision {
  const assessment: RiskAssessment | null = ai.ok ? ai.assessment : null

  if (rules.verdict !== 'PASS') {
    const ruleText = rules.triggered.map((t) => t.message).join(' ')
    return {
      action: 'hold',
      riskLevel: 'high',
      source: 'rules',
      // Lead with the rules that fired; add the AI's view only when it also saw a concern.
      reason: [ruleText, assessment && assessment.risk_level !== 'low' ? assessment.reason : '']
        .filter(Boolean)
        .join(' '),
    }
  }

  if (!assessment) {
    return {
      action: 'hold',
      riskLevel: 'high',
      source: 'ai_error',
      reason: "Haven's safety check couldn't be completed, so this payment is waiting for your review.",
    }
  }

  switch (assessment.risk_level) {
    case 'low':
      return { action: 'confirm', riskLevel: 'low', reason: assessment.reason }
    case 'medium': {
      const question = assessment.next_question?.trim()
      if (followUpsAsked >= MAX_FOLLOW_UPS || !question) {
        return {
          action: 'hold',
          riskLevel: 'high',
          source: 'escalation',
          reason: question
            ? `Still unclear after ${MAX_FOLLOW_UPS} follow-up questions. ${assessment.reason}`
            : assessment.reason,
        }
      }
      return { action: 'ask', riskLevel: 'medium', reason: assessment.reason, question }
    }
    case 'high':
      return { action: 'hold', riskLevel: 'high', source: 'ai', reason: assessment.reason }
    default:
      // Unreachable with a validated assessment; fail closed anyway.
      return {
        action: 'hold',
        riskLevel: 'high',
        source: 'ai_error',
        reason: 'Unrecognized risk level from the safety check.',
      }
  }
}
