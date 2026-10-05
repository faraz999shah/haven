'use client'

import { useState } from 'react'
import { formatDistanceToNow, isThisMonth, isToday, subDays } from 'date-fns'
import { CheckCircle2, Clock3, DollarSign, Send, ShieldCheck, X } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatCents } from '@/lib/money'
import { useCaregiver, type CaregiverPayment } from './caregiver-context'
import { SIGNAL_LABELS } from './caregiver-dialogs'
import { PaymentsTable } from './payments-table'
import { RiskBadge } from './risk-badge'
import { StatCard } from './stat-card'

const initials = (name: string) =>
  name
    .replace(/[^A-Za-z ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function HeldCard({ p }: { p: CaregiverPayment }) {
  const { openApprove, openDecline, openDetail } = useCaregiver()
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[#f1dfb8] bg-[#fffaf0] p-4">
      <div className="flex items-start gap-3">
        <Avatar className="size-11">
          <AvatarFallback className="bg-[#fed7aa] text-[#9a3412]">{initials(p.payeeName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="font-semibold">
            {p.payeeName} <span className="font-normal text-[#7f806f]">· {formatCents(p.amountCents)}</span>
            {p.purpose && <span className="font-normal text-[#7f806f]"> · {p.purpose}</span>}
          </p>
          {p.reason && <p className="mt-2 text-sm leading-relaxed text-[#625d4e]">{p.reason}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <RiskBadge level={p.riskLevel} />
            {p.aiSignals.map((s) => (
              <Badge key={s} variant="outline" className="rounded-full border-[#f5c2c2] text-[#991b1b]">
                {SIGNAL_LABELS[s] ?? s}
              </Badge>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button className="bg-[#b91c1c] hover:bg-[#991b1b]" onClick={() => openDecline(p)}>
          <X />
          Decline
        </Button>
        <Button variant="outline" className="border-[#1f6b4f] text-[#1f6b4f]" onClick={() => openApprove(p)}>
          Approve
        </Button>
        <span className="text-sm text-[#7f806f]">
          Held {formatDistanceToNow(new Date(p.createdAt), { addSuffix: true })}
        </span>
        <button onClick={() => openDetail(p.id)} className="text-sm font-medium text-[#1f6b4f] underline">
          See conversation
        </button>
      </div>
    </div>
  )
}

export function CaregiverDashboard({ setPage }: { setPage: (p: string) => void }) {
  const { payments } = useCaregiver()
  const [search, setSearch] = useState('')
  const list = payments ?? []

  const held = list.filter((p) => p.status === 'held')
  const today = list.filter((p) => isToday(new Date(p.createdAt)) && p.status !== 'cancelled')
  const sentToday = today.filter((p) => p.status === 'sent').length
  const weekAgo = subDays(new Date(), 7)
  const flagged = list.filter((p) => p.riskLevel === 'high' && new Date(p.createdAt) >= weekAgo)
  const sentMonth = list.filter((p) => p.status === 'sent' && isThisMonth(new Date(p.sentAt ?? p.createdAt)))
  const dash = payments ? undefined : '–'

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-[#e7e8e2] shadow-none">
        <CardHeader className="flex-row items-center justify-between p-6 pb-4">
          <div>
            <CardTitle className="text-lg">Needs your attention</CardTitle>
            <CardDescription>
              {held.length
                ? `Haven is holding ${held.length === 1 ? 'this payment' : 'these payments'} until you review ${held.length === 1 ? 'it' : 'them'}.`
                : 'Nothing is waiting for you.'}
            </CardDescription>
          </div>
          {held.length > 0 && <Badge className="bg-[#fff1d2] text-[#9a6a1a]">{held.length} awaiting review</Badge>}
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-6 pt-0">
          {held.length === 0 ? (
            <div className="flex items-center gap-3 rounded-2xl bg-[#f1f8f2] p-4 text-sm text-[#466352]">
              <CheckCircle2 className="size-5 text-[#1f6b4f]" />
              All caught up. Haven will let you know when a payment needs a look.
            </div>
          ) : (
            held.map((p) => <HeldCard key={p.id} p={p} />)
          )}
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Payments today"
          value={dash ?? String(today.length)}
          note={`${sentToday} sent`}
          icon={Send}
          tone="bg-[#e5f4e8] text-[#23704a]"
        />
        <StatCard
          label="Amount held for review"
          value={dash ?? formatCents(held.reduce((s, p) => s + p.amountCents, 0))}
          note={
            held.length
              ? `${plural(held.length, 'payment')} need${held.length === 1 ? 's' : ''} you`
              : 'Nothing waiting'
          }
          icon={Clock3}
          tone="bg-[#fff2d7] text-[#b7791f]"
        />
        <StatCard
          label="Flagged this week"
          value={dash ?? String(flagged.length)}
          note={`${flagged.filter((p) => p.status === 'held').length} need your review`}
          icon={ShieldCheck}
          tone="bg-[#f4e8ff] text-[#7e22ce]"
        />
        <StatCard
          label="Total sent this month"
          value={dash ?? formatCents(sentMonth.reduce((s, p) => s + p.amountCents, 0))}
          note={plural(sentMonth.length, 'payment')}
          icon={DollarSign}
          tone="bg-[#e3f1ff] text-[#2563a6]"
        />
      </div>
      <Card className="border-[#e7e8e2] shadow-none">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Payments</CardTitle>
          <div className="flex items-center gap-3">
            <Input
              className="max-w-sm"
              placeholder="Search payments"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search payments"
            />
            <Button variant="ghost" className="shrink-0 text-[#1f6b4f]" onClick={() => setPage('payments')}>
              View all
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <PaymentsTable search={search} pageSize={5} />
        </CardContent>
      </Card>
    </div>
  )
}

export function AllPaymentsPage() {
  const [search, setSearch] = useState('')
  return (
    <Card className="border-[#e7e8e2] shadow-none">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>All payments</CardTitle>
          <CardDescription>Click a payment to see the conversation and Haven&apos;s reasoning.</CardDescription>
        </div>
        <Input
          className="max-w-sm"
          placeholder="Search payments"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search payments"
        />
      </CardHeader>
      <CardContent>
        <PaymentsTable search={search} pageSize={25} />
      </CardContent>
    </Card>
  )
}
