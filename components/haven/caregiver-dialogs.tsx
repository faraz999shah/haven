'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { AlertTriangle, Bot, ShieldAlert, User } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import { formatCents } from '@/lib/money'
import { useCaregiver, type CaregiverPayment } from './caregiver-context'
import { RiskBadge, StatusBadge } from './risk-badge'

export const SIGNAL_LABELS: Record<string, string> = {
  urgency: 'Urgency',
  secrecy: 'Secrecy',
  impersonation: 'Impersonation',
  gift_cards: 'Gift cards',
  crypto: 'Crypto',
  wire_or_unusual_method: 'Unusual payment method',
  third_party_pressure: 'Pressure from someone else',
  never_met_in_person: 'Never met in person',
  prize_or_lottery: 'Prize or lottery',
  unknown_payee: 'Unknown payee',
  unusual_amount: 'Unusual amount',
}

async function post(url: string, body?: unknown): Promise<string | null> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  }).catch(() => null)
  if (!res) return 'Could not reach Haven. Please try again.'
  if (res.ok) return null
  return (await res.json().catch(() => null))?.error ?? 'Something went wrong. Please try again.'
}

export function CaregiverDialogs() {
  return (
    <>
      <ApproveDialog />
      <DeclineDialog />
      <PaymentDetailSheet />
    </>
  )
}

function ApproveDialog() {
  const { approving: p, closeDialogs, refresh } = useCaregiver()
  const [email, setEmail] = useState('')
  const [addTrusted, setAddTrusted] = useState(false)
  const [relationship, setRelationship] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setEmail(p?.payeeEmail ?? '')
    setAddTrusted(false)
    setRelationship('')
    setError(null)
  }, [p?.id, p?.payeeEmail])

  if (!p) return null
  const needsEmail = !p.payeeEmail

  const submit = async () => {
    setBusy(true)
    setError(null)
    const err = await post(`/api/caregiver/payments/${p.id}/approve`, {
      payeeEmail: needsEmail ? email : null,
      addToTrusted: addTrusted ? { relationship } : null,
    })
    setBusy(false)
    if (err) return setError(err)
    closeDialogs()
    void refresh()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && closeDialogs()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Send {formatCents(p.amountCents)} to {p.payeeName}?
          </DialogTitle>
          <DialogDescription>Haven will send this payment through PayPal right away.</DialogDescription>
        </DialogHeader>
        {p.riskLevel === 'high' && (
          <div className="flex gap-3 rounded-xl border border-[#f5c2c2] bg-[#fff5f5] p-3 text-sm text-[#7f1d1d]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              Haven flagged this as high risk. {p.aiSignals.length > 0 && 'If this could be a scam, '}
              please check with Margaret, or call the person directly using a number you already know, before approving.
            </p>
          </div>
        )}
        {needsEmail && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="approve-email">{p.payeeName}&apos;s PayPal email</Label>
            <Input
              id="approve-email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-xs text-[#7a887e]">Haven doesn&apos;t have a PayPal email for this payee yet.</p>
          </div>
        )}
        {!p.trustedPayeeId && (
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={addTrusted} onCheckedChange={(v) => setAddTrusted(v === true)} />
              Add {p.payeeName} to Margaret&apos;s trusted people
            </label>
            {addTrusted && (
              <Input
                placeholder="Relationship, e.g. Grandson"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                aria-label="Relationship"
              />
            )}
          </div>
        )}
        {error && <p className="text-sm text-[#b91c1c]">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={closeDialogs} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="bg-[#1f6b4f] hover:bg-[#18573f]"
            onClick={submit}
            disabled={busy || (needsEmail && !email.trim())}
          >
            {busy && <Spinner />} Approve and send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeclineDialog() {
  const { declining: p, closeDialogs, refresh } = useCaregiver()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setError(null), [p?.id])
  if (!p) return null

  const submit = async () => {
    setBusy(true)
    const err = await post(`/api/caregiver/payments/${p.id}/decline`)
    setBusy(false)
    if (err) return setError(err)
    closeDialogs()
    void refresh()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && closeDialogs()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Decline {formatCents(p.amountCents)} to {p.payeeName}?
          </DialogTitle>
          <DialogDescription>
            The money won&apos;t be sent. Next time Margaret opens Haven, it will gently let her know you decided not to
            send it.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-[#b91c1c]">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={closeDialogs} disabled={busy}>
            Keep holding
          </Button>
          <Button className="bg-[#b91c1c] hover:bg-[#991b1b]" onClick={submit} disabled={busy}>
            {busy && <Spinner />} Decline payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface Detail {
  payment: CaregiverPayment
  transcript: { role: 'senior' | 'haven'; text: string; createdAt: string }[]
}

function PaymentDetailSheet() {
  const { detailId, openDetail, payments, openApprove, openDecline } = useCaregiver()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState(false)

  // Refetch when opened, and whenever this payment changes in the live list (e.g. Sending → Sent).
  const live = payments?.find((p) => p.id === detailId)
  const version = live ? `${live.status}:${live.updatedAt}` : ''
  useEffect(() => {
    if (!detailId) return setDetail(null)
    let cancelled = false
    fetch(`/api/caregiver/payments/${detailId}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => !cancelled && (setDetail(d), setError(false)))
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [detailId, version])

  const p = detail?.payment.id === detailId ? detail.payment : null

  return (
    <Sheet open={Boolean(detailId)} onOpenChange={(open) => !open && openDetail(null)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{p ? `${formatCents(p.amountCents)} to ${p.payeeName}` : 'Payment'}</SheetTitle>
          <SheetDescription>
            {p ? `${format(new Date(p.createdAt), 'EEEE, MMM d, h:mm a')}${p.purpose ? ` · ${p.purpose}` : ''}` : ''}
          </SheetDescription>
        </SheetHeader>
        {error && <p className="px-4 text-sm text-[#b91c1c]">Couldn&apos;t load this payment.</p>}
        {!p && !error && (
          <p className="flex items-center gap-2 px-4 text-sm text-[#6b7c70]">
            <Spinner /> Loading...
          </p>
        )}
        {p && detail && (
          <div className="flex flex-col gap-6 px-4 pb-8">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={p.status} />
              <RiskBadge level={p.riskLevel} />
              {!p.trustedPayeeId && (
                <Badge variant="outline" className="rounded-full">
                  Not on trusted list
                </Badge>
              )}
            </div>

            {p.status === 'held' && (
              <div className="flex gap-2">
                <Button className="bg-[#b91c1c] hover:bg-[#991b1b]" onClick={() => openDecline(p)}>
                  Decline
                </Button>
                <Button variant="outline" className="border-[#1f6b4f] text-[#1f6b4f]" onClick={() => openApprove(p)}>
                  Approve
                </Button>
              </div>
            )}

            {p.reason && (
              <section>
                <h3 className="text-sm font-semibold text-[#1f3026]">Why Haven decided this</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#4c5d52]">{p.reason}</p>
              </section>
            )}

            <section className="rounded-2xl border border-[#e7eee7] p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-[#1f3026]">
                <Bot className="size-4" /> AI safety check
              </h3>
              {p.aiRiskLevel ? (
                <>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[#4c5d52]">
                    AI rated this <RiskBadge level={p.aiRiskLevel} />
                  </div>
                  {p.aiSignals.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {p.aiSignals.map((s) => (
                        <Badge key={s} className="rounded-full bg-[#fee2e2] text-[#991b1b]">
                          {SIGNAL_LABELS[s] ?? s}
                        </Badge>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="mt-2 text-sm text-[#7a887e]">
                  {p.conversationId ? "The AI check didn't complete, so Haven held this payment." : 'No AI check.'}
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-[#e7eee7] p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-[#1f3026]">
                <ShieldAlert className="size-4" /> Protection rules
              </h3>
              {p.rulesTriggered.length ? (
                <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-[#4c5d52]">
                  {p.rulesTriggered.map((r) => (
                    <li key={r.code}>{r.message}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-[#7a887e]">All of your rules passed.</p>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-[#1f3026]">Conversation</h3>
              {detail.transcript.length === 0 ? (
                <p className="mt-2 text-sm text-[#7a887e]">No conversation recorded.</p>
              ) : (
                <div className="mt-3 flex flex-col gap-3">
                  {detail.transcript.map((t, i) => (
                    <div key={i} className={t.role === 'senior' ? 'flex gap-2' : 'flex flex-row-reverse gap-2'}>
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#eef5ef] text-[#286145]">
                        {t.role === 'senior' ? <User className="size-4" /> : <Bot className="size-4" />}
                      </div>
                      <div
                        className={
                          t.role === 'senior'
                            ? 'max-w-[85%] rounded-2xl rounded-tl-sm bg-[#f5f9f5] px-3 py-2 text-sm'
                            : 'max-w-[85%] rounded-2xl rounded-tr-sm bg-[#1f6b4f] px-3 py-2 text-sm text-white'
                        }
                      >
                        <p className="text-xs opacity-70">
                          {t.role === 'senior' ? 'Margaret' : 'Haven'} · {format(new Date(t.createdAt), 'h:mm a')}
                        </p>
                        <p className="mt-0.5">{t.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl bg-[#f5f9f5] p-4 text-sm">
              <h3 className="font-semibold text-[#1f3026]">PayPal</h3>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[#4c5d52]">
                <dt>Recipient</dt>
                <dd className="break-all">{p.payeeEmail ?? '—'}</dd>
                <dt>Batch ID</dt>
                <dd className="font-mono">{p.paypalBatchId ?? '—'}</dd>
                <dt>Item ID</dt>
                <dd className="font-mono">{p.paypalItemId ?? '—'}</dd>
                <dt>Status</dt>
                <dd>{p.paypalStatus ?? '—'}</dd>
                {p.paypalError && (
                  <>
                    <dt>Error</dt>
                    <dd className="text-[#b91c1c]">{p.paypalError}</dd>
                  </>
                )}
                {p.sentAt && (
                  <>
                    <dt>Sent</dt>
                    <dd>{format(new Date(p.sentAt), 'MMM d, h:mm:ss a')}</dd>
                  </>
                )}
              </dl>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
