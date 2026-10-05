import { Badge } from '@/components/ui/badge'
import type { PaymentStatus, RiskLevel } from '@/lib/domain'
import { cn } from '@/lib/utils'

export const riskTone: Record<RiskLevel, string> = {
  low: 'bg-[#dcfce7] text-[#15803d]',
  medium: 'bg-[#fef3c7] text-[#a16207]',
  high: 'bg-[#fee2e2] text-[#b91c1c]',
}

export function RiskBadge({ level }: { level: RiskLevel | 'Low' | 'Medium' | 'High' }) {
  const key = level.toLowerCase() as RiskLevel
  return (
    <Badge variant="outline" className={cn('rounded-full border-0 px-2.5 py-1 text-xs font-semibold', riskTone[key])}>
      {key[0].toUpperCase() + key.slice(1)} risk
    </Badge>
  )
}

// How each status is described to the caregiver.
export const caregiverStatus: Record<PaymentStatus, { label: string; tone: string }> = {
  awaiting_confirmation: { label: 'Waiting for Margaret', tone: 'bg-[#f1f5f9] text-[#475569]' },
  held: { label: 'Needs review', tone: 'bg-[#fff1d2] text-[#9a6a1a]' },
  approved: { label: 'Approved', tone: 'bg-[#dbeafe] text-[#1d4ed8]' },
  sending: { label: 'Sending', tone: 'bg-[#dbeafe] text-[#1d4ed8]' },
  sent: { label: 'Sent', tone: 'bg-[#dcfce7] text-[#15803d]' },
  failed: { label: 'Failed', tone: 'bg-[#fee2e2] text-[#b91c1c]' },
  declined: { label: 'Declined', tone: 'bg-[#f1f5f9] text-[#475569]' },
  cancelled: { label: 'Cancelled', tone: 'bg-[#f1f5f9] text-[#475569]' },
}

export function StatusBadge({ status }: { status: PaymentStatus }) {
  const s = caregiverStatus[status]
  return (
    <Badge variant="outline" className={cn('rounded-full border-0 px-2.5 py-1 text-xs font-semibold', s.tone)}>
      {s.label}
    </Badge>
  )
}
