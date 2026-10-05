'use client'

import { useEffect, useState } from 'react'
import { format, isToday, isYesterday } from 'date-fns'
import { ArrowLeft } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import { seniorStatus, type PaymentSummary } from './payment-status'

const TONES = [
  'bg-[#e9d5ff] text-[#6b21a8]',
  'bg-[#bae6fd] text-[#075985]',
  'bg-[#bbf7d0] text-[#166534]',
  'bg-[#fed7aa] text-[#9a3412]',
  'bg-[#fbcfe8] text-[#9d174d]',
]

const initials = (name: string) =>
  name
    .replace(/[^A-Za-z ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')

const toneFor = (name: string) => TONES[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % TONES.length]

function friendlyDate(iso: string) {
  const d = new Date(iso)
  const time = format(d, 'h:mm a')
  if (isToday(d)) return `Today, ${time}`
  if (isYesterday(d)) return `Yesterday, ${time}`
  return format(d, 'EEE, MMM d')
}

interface Row {
  key: string
  name: string
  detail: string
  date?: string
  status?: PaymentSummary['status']
}

export function SeniorList({ contactsView = false, onBack }: { contactsView?: boolean; onBack: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        if (contactsView) {
          const { payees } = await (await fetch('/api/senior/payees')).json()
          if (!cancelled)
            setRows(
              payees.map((p: { id: string; name: string; relationship: string }) => ({
                key: p.id,
                name: p.name,
                detail: p.relationship || 'Trusted',
              })),
            )
        } else {
          const { payments } = await (await fetch('/api/senior/payments')).json()
          if (!cancelled)
            setRows(
              payments.map((p: PaymentSummary & { createdAt: string }) => ({
                key: p.id,
                name: p.payeeName,
                detail: `${formatCents(p.amountCents)}${p.purpose ? ` · ${p.purpose}` : ''}`,
                date: friendlyDate(p.createdAt),
                status: p.status,
              })),
            )
        }
        if (!cancelled) setError(false)
      } catch {
        if (!cancelled) setError(true)
      }
    }
    void load()
    // Keep statuses fresh (e.g. "On its way" → "Sent") while the list is open.
    const timer = contactsView ? null : setInterval(load, 5000)
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [contactsView])

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" className="h-12 w-fit text-lg text-[#1f6b4f]" onClick={onBack}>
        <ArrowLeft className="size-5" /> Back
      </Button>
      <Card className="border-[#e7e8e2] shadow-none">
        <CardHeader className="p-6">
          <CardTitle className="text-2xl">{contactsView ? 'Trusted contacts' : 'Payment history'}</CardTitle>
          <CardDescription className="text-base">
            {contactsView
              ? 'People and businesses you pay regularly.'
              : 'Your recent payments, all in one simple list.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 p-6 pt-0">
          {error && <p className="text-lg text-[#9a3412]">Sorry, I couldn&apos;t load this. Please try again.</p>}
          {!rows && !error && (
            <p className="flex items-center gap-3 text-lg text-[#6b7c70]">
              <Spinner className="size-5" /> Loading...
            </p>
          )}
          {rows?.length === 0 && (
            <p className="text-lg text-[#6b7c70]">{contactsView ? 'No trusted contacts yet.' : 'No payments yet.'}</p>
          )}
          {rows?.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-3 rounded-2xl p-3">
              <div className="flex items-center gap-3">
                <Avatar className="size-11">
                  <AvatarFallback className={toneFor(row.name)}>{initials(row.name)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-lg font-semibold">{row.name}</p>
                  <p className="text-base text-[#7a887e]">{row.detail}</p>
                </div>
              </div>
              {row.status && (
                <div className="text-right">
                  <p className="text-base text-[#69766d]">{row.date}</p>
                  <Badge className={cn('mt-1', seniorStatus[row.status].tone)}>{seniorStatus[row.status].label}</Badge>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
