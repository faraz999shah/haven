'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { speak, useSpeechRecognition } from '@/hooks/use-speech'
import { cn } from '@/lib/utils'
import { seniorStatus, type PaymentSummary } from './payment-status'
import type { Role } from './types'

type Stage = 'collecting' | 'awaiting_confirmation' | 'done'
interface Turn {
  role: 'senior' | 'haven'
  text: string
}

export function SeniorHome({ setRole, setPage }: { setRole: (role: Role) => void; setPage: (page: string) => void }) {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [stage, setStage] = useState<Stage>('collecting')
  const [payment, setPayment] = useState<PaymentSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')

  const send = useCallback(
    async (body: { text?: string; action?: 'confirm' | 'cancel' }) => {
      if (busy) return
      const shown = body.text ?? (body.action === 'confirm' ? 'Yes, send it.' : 'No, cancel.')
      setTurns((t) => [...t, { role: 'senior', text: shown }])
      setBusy(true)
      setFailed(false)
      try {
        const res = await fetch('/api/converse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId, ...body }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: { conversationId: string; reply: string; stage: Stage; payment: PaymentSummary | null } =
          await res.json()
        setTurns((t) => [...t, { role: 'haven', text: data.reply }])
        setStage(data.stage)
        setPayment(data.payment)
        // A finished conversation means the next thing Margaret says starts a new one.
        setConversationId(data.stage === 'done' ? null : data.conversationId)
        speak(data.reply)
      } catch {
        setFailed(true)
        speak('Sorry, something went wrong. Please try again.')
      } finally {
        setBusy(false)
      }
    },
    [busy, conversationId],
  )

  const startOver = useCallback(
    (text: string) => {
      // Saying something new after a finished payment starts a fresh conversation on screen too.
      if (stage === 'done') {
        setTurns([])
        setPayment(null)
        setStage('collecting')
      }
      void send({ text })
    },
    [send, stage],
  )

  const mic = useSpeechRecognition(startOver)

  // Only open the typing box for errors that won't go away by trying again.
  useEffect(() => {
    if (mic.error && !/didn't hear anything/.test(mic.error)) setTyping(true)
  }, [mic.error])

  // While a sent payment is on its way, refresh its status until PayPal settles it.
  const paymentId = payment?.id
  const inFlight = payment?.status === 'sending' || payment?.status === 'approved'
  const announced = useRef<string | null>(null)
  useEffect(() => {
    if (!paymentId || !inFlight) return
    const timer = setInterval(async () => {
      const res = await fetch(`/api/payments/${paymentId}`).catch(() => null)
      if (!res?.ok) return
      const { payment: p } = await res.json()
      setPayment((cur) => (cur && cur.id === p.id ? { ...cur, status: p.status } : cur))
    }, 3000)
    return () => clearInterval(timer)
  }, [paymentId, inFlight])

  useEffect(() => {
    if (!payment || announced.current === `${payment.id}:${payment.status}`) return
    if (payment.status === 'sent' && stage === 'done') {
      announced.current = `${payment.id}:sent`
      speak(`${payment.payeeName.split(' ')[0]} has received it.`)
    }
  }, [payment, stage])

  const submitTyped = () => {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    startOver(text)
  }

  const lastSenior = [...turns].reverse().find((t) => t.role === 'senior')
  const lastHaven = turns.at(-1)?.role === 'haven' ? turns.at(-1) : null
  const earlier = turns.slice(0, lastHaven ? -2 : -1).slice(-4)

  const prompt = busy
    ? 'Let me check that...'
    : mic.listening
      ? "I'm listening..."
      : stage === 'awaiting_confirmation'
        ? 'Tap a button below, or tap the microphone and say yes or no'
        : turns.length && stage === 'collecting'
          ? 'Tap the microphone to answer'
          : 'Tap and tell me who to pay'

  return (
    <div className="relative flex min-h-[calc(100vh-150px)] flex-col items-center justify-center pb-28">
      <div className="w-full max-w-2xl">
        <Card className="border-[#dfe9df] bg-[#f7fbf6] shadow-none">
          <CardContent className="flex flex-col items-center p-6 sm:p-10">
            <button
              onClick={() => (mic.listening ? mic.stop() : mic.start())}
              disabled={busy || !mic.supported}
              aria-label={mic.listening ? 'Stop listening' : 'Tap and tell Haven who to pay'}
              className={cn(
                'relative flex size-44 items-center justify-center rounded-full bg-[#1f6b4f] text-white shadow-[0_12px_30px_rgba(31,107,79,0.25)] transition-transform hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100',
                mic.listening && 'animate-pulse ring-8 ring-[#cce7d3]',
              )}
            >
              {busy ? (
                <Spinner className="size-14" />
              ) : mic.listening ? (
                <Square className="size-14" />
              ) : (
                <Mic className="size-16" />
              )}
            </button>
            <p className="mt-8 text-center text-2xl font-semibold text-[#244332]" aria-live="polite">
              {prompt}
            </p>
            {mic.listening && mic.interim ? (
              <p className="mt-2 text-center text-lg text-[#3d5948]">&ldquo;{mic.interim}&rdquo;</p>
            ) : turns.length === 0 ? (
              <p className="mt-2 text-lg font-medium text-[#3d5948]">Try saying &quot;Pay Maria $85&quot;</p>
            ) : null}
            {!mic.supported && (
              <p className="mt-2 text-center text-base text-[#6b7c70]">
                Voice isn&apos;t available in this browser. Please type instead.
              </p>
            )}
            {mic.error && <p className="mt-2 text-center text-base text-[#9a6a1a]">{mic.error}</p>}
            <button
              onClick={() => setTyping(!typing)}
              className="mt-5 text-lg font-semibold text-[#1f6b4f] underline underline-offset-4"
            >
              Type instead.
            </button>
            {(typing || !mic.supported) && (
              <form
                className="mt-5 flex w-full gap-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  submitTyped()
                }}
              >
                <Input
                  className="h-14 bg-white text-lg"
                  placeholder={
                    stage === 'collecting' && turns.length ? 'Type your answer' : 'Who would you like to pay?'
                  }
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-label="Type your request"
                />
                <Button type="submit" disabled={busy || !draft.trim()} className="h-14 bg-[#1f6b4f] px-6 text-lg">
                  Send
                </Button>
              </form>
            )}

            {turns.length > 0 && (
              <div className="mt-8 w-full rounded-2xl border border-[#cfe4d2] bg-white p-6" aria-live="polite">
                {earlier.length > 0 && (
                  <div className="mb-4 flex flex-col gap-1 border-b border-[#eef3ee] pb-4 text-base text-[#7a887e]">
                    {earlier.map((t, i) => (
                      <p key={i}>
                        <span className="font-semibold">{t.role === 'senior' ? 'You' : 'Haven'}:</span> {t.text}
                      </p>
                    ))}
                  </div>
                )}
                {lastSenior && <p className="text-base text-[#6b7c70]">You said: {lastSenior.text}</p>}
                {lastHaven ? (
                  <p className="mt-3 text-2xl font-semibold leading-snug text-[#1d3828]">{lastHaven.text}</p>
                ) : failed ? (
                  <p className="mt-3 text-2xl font-semibold leading-snug text-[#9a3412]">
                    Sorry, something went wrong. Please try again.
                  </p>
                ) : (
                  <p className="mt-3 flex items-center gap-3 text-xl text-[#3d5948]">
                    <Spinner className="size-5" /> One moment...
                  </p>
                )}

                {stage === 'awaiting_confirmation' && !busy && (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <Button
                      className="h-14 bg-[#1f6b4f] text-lg hover:bg-[#18573f]"
                      onClick={() => send({ action: 'confirm' })}
                    >
                      Yes, send it
                    </Button>
                    <Button
                      variant="outline"
                      className="h-14 border-[#1f6b4f] text-lg text-[#1f6b4f]"
                      onClick={() => send({ action: 'cancel' })}
                    >
                      No, cancel
                    </Button>
                  </div>
                )}

                {stage === 'collecting' && !busy && turns.length > 0 && (
                  <Button
                    variant="ghost"
                    className="mt-4 h-12 text-base text-[#6b7c70]"
                    onClick={() => send({ action: 'cancel' })}
                  >
                    Never mind, stop
                  </Button>
                )}

                {stage === 'done' && payment && (
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <Badge className={cn('rounded-full px-3 py-1 text-base', seniorStatus[payment.status].tone)}>
                      {seniorStatus[payment.status].label}
                    </Badge>
                    {payment.status === 'sending' && (
                      <span className="flex items-center gap-2 text-base text-[#6b7c70]">
                        <Spinner className="size-4" /> Checking with PayPal...
                      </span>
                    )}
                  </div>
                )}

                {stage === 'done' && !busy && (
                  <Button
                    variant="outline"
                    className="mt-5 h-14 w-full border-[#1f6b4f] text-lg text-[#1f6b4f]"
                    onClick={() => {
                      setTurns([])
                      setPayment(null)
                      setStage('collecting')
                    }}
                  >
                    Start a new payment
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="fixed inset-x-0 bottom-0 flex justify-center gap-3 bg-[#f4f7f2] px-5 pb-5 pt-3">
        <Button variant="outline" className="h-14 flex-1 max-w-xs text-lg" onClick={() => setPage('history')}>
          My payments
        </Button>
        <Button variant="outline" className="h-14 flex-1 max-w-xs text-lg" onClick={() => setPage('contacts')}>
          My people
        </Button>
      </div>
      <button onClick={() => setRole('caregiver')} className="fixed bottom-3 right-3 text-xs text-[#718078] underline">
        Demo: switch view
      </button>
    </div>
  )
}
