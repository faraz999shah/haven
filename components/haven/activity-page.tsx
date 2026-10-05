'use client'

import { format, formatDistanceToNow } from 'date-fns'
import { Ban, Check, Clock3, Send, X, XCircle, type LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useCaregiver, type CaregiverPayment } from './caregiver-context'

interface Event {
  key: string
  paymentId: string
  at: Date
  title: string
  icon: LucideIcon
  color: string
}

// The activity feed is derived from payments: each one contributes the events it went through.
function eventsFor(p: CaregiverPayment): Event[] {
  const amount = formatCents(p.amountCents)
  const ev = (suffix: string, at: string | null, title: string, icon: LucideIcon, color: string): Event | null =>
    at ? { key: `${p.id}:${suffix}`, paymentId: p.id, at: new Date(at), title, icon, color } : null
  const decidedByCaregiver = Boolean(p.decidedAt)
  const list: (Event | null)[] = []

  if (decidedByCaregiver || p.status === 'held') {
    list.push(
      ev(
        'held',
        p.createdAt,
        `Payment held for your review: ${amount} to ${p.payeeName}`,
        Clock3,
        'bg-[#fef3c7] text-[#b45309]',
      ),
    )
  }
  if (p.status === 'declined') {
    list.push(ev('declined', p.decidedAt, `You declined ${amount} to ${p.payeeName}`, X, 'bg-[#f1f5f9] text-[#475569]'))
  }
  if (decidedByCaregiver && ['approved', 'sending', 'sent', 'failed'].includes(p.status)) {
    list.push(
      ev('approved', p.decidedAt, `You approved ${amount} to ${p.payeeName}`, Check, 'bg-[#dbeafe] text-[#1d4ed8]'),
    )
  }
  if (p.status === 'sent') {
    list.push(
      ev(
        'sent',
        p.sentAt ?? p.updatedAt,
        `Payment sent to ${p.payeeName}: ${amount}`,
        Send,
        'bg-[#dcfce7] text-[#15803d]',
      ),
    )
  }
  if (p.status === 'failed') {
    list.push(
      ev('failed', p.updatedAt, `Payment to ${p.payeeName} didn't go through`, XCircle, 'bg-[#fee2e2] text-[#b91c1c]'),
    )
  }
  if (p.status === 'cancelled') {
    list.push(
      ev(
        'cancelled',
        p.updatedAt,
        `Margaret cancelled ${amount} to ${p.payeeName}`,
        Ban,
        'bg-[#f1f5f9] text-[#475569]',
      ),
    )
  }
  return list.filter((e): e is Event => e !== null)
}

export function ActivityPage() {
  const { payments, openDetail } = useCaregiver()
  const events = (payments ?? [])
    .flatMap(eventsFor)
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 50)

  return (
    <Card className="max-w-3xl border-[#e7e8e2] shadow-none">
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {!payments && <p className="text-sm text-[#7a887e]">Loading...</p>}
        {payments && events.length === 0 && <p className="text-sm text-[#7a887e]">No activity yet.</p>}
        {events.map((item) => (
          <button
            key={item.key}
            onClick={() => openDetail(item.paymentId)}
            className="flex gap-4 rounded-xl px-2 py-4 text-left hover:bg-[#f5f9f5]"
          >
            <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', item.color)}>
              <item.icon />
            </div>
            <div>
              <p className="font-semibold">{item.title}</p>
              <p className="mt-1 text-sm text-[#7a887e]" title={format(item.at, 'PPpp')}>
                {formatDistanceToNow(item.at, { addSuffix: true })}
              </p>
            </div>
          </button>
        ))}
      </CardContent>
    </Card>
  )
}
