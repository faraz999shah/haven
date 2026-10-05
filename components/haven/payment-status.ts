import type { PaymentStatus } from '@/lib/domain'

// How each status is described to Margaret, in plain words.
export const seniorStatus: Record<PaymentStatus, { label: string; tone: string }> = {
  awaiting_confirmation: { label: 'Waiting for you', tone: 'bg-[#fef3c7] text-[#a16207]' },
  held: { label: 'Waiting for Sarah', tone: 'bg-[#fef3c7] text-[#a16207]' },
  approved: { label: 'On its way', tone: 'bg-[#dbeafe] text-[#1d4ed8]' },
  sending: { label: 'On its way', tone: 'bg-[#dbeafe] text-[#1d4ed8]' },
  sent: { label: 'Sent', tone: 'bg-[#dcfce7] text-[#15803d]' },
  failed: { label: "Didn't go through", tone: 'bg-[#fee2e2] text-[#b91c1c]' },
  declined: { label: 'Not sent', tone: 'bg-[#f1f5f9] text-[#475569]' },
  cancelled: { label: 'Cancelled', tone: 'bg-[#f1f5f9] text-[#475569]' },
}

export interface PaymentSummary {
  id: string
  payeeName: string
  amountCents: number
  purpose: string | null
  status: PaymentStatus
}
