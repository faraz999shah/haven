'use client'

// Gently tells Margaret what Sarah decided about a payment that was waiting for her.

import { useCallback, useEffect, useRef, useState } from 'react'
import { HeartHandshake } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { speak } from '@/hooks/use-speech'
import { formatCents } from '@/lib/money'

interface Notice {
  id: string
  payeeName: string
  amountCents: number
  status: string
}

function message(n: Notice): string {
  const amount = formatCents(n.amountCents)
  if (n.status === 'declined') {
    return `Sarah looked at your payment of ${amount} to ${n.payeeName} and decided not to send it. Nothing was sent. If you have any questions, Sarah is happy to talk it through.`
  }
  if (n.status === 'failed') {
    return `Sarah approved your payment of ${amount} to ${n.payeeName}, but it didn't go through. Sarah can see what happened.`
  }
  return `Good news: Sarah approved your payment of ${amount} to ${n.payeeName}. It's on its way.`
}

export function SeniorNotices() {
  const [notices, setNotices] = useState<Notice[]>([])
  const spoken = useRef(new Set<string>())

  const load = useCallback(async () => {
    const res = await fetch('/api/senior/notices', { cache: 'no-store' }).catch(() => null)
    if (res?.ok) setNotices((await res.json()).notices)
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(load, 10_000)
    return () => clearInterval(timer)
  }, [load])

  const current = notices[0]
  useEffect(() => {
    if (current && !spoken.current.has(current.id)) {
      spoken.current.add(current.id)
      speak(message(current))
    }
  }, [current])

  if (!current) return null

  const dismiss = async () => {
    setNotices((n) => n.slice(1))
    await fetch('/api/senior/notices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [current.id] }),
    }).catch(() => null)
  }

  return (
    <Card className="mb-6 w-full max-w-2xl border-[#cfe4d2] bg-white shadow-none" role="status" aria-live="polite">
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#e5f4e8] text-[#1f6b4f]">
            <HeartHandshake className="size-6" />
          </div>
          <div>
            <p className="text-lg font-semibold text-[#1d3828]">A note about your payment</p>
            <p className="mt-1 text-xl leading-relaxed text-[#2f4a3a]">{message(current)}</p>
          </div>
        </div>
        <Button className="h-14 bg-[#1f6b4f] text-lg hover:bg-[#18573f]" onClick={dismiss}>
          OK, thank you
        </Button>
      </CardContent>
    </Card>
  )
}
