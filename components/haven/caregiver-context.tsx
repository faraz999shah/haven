'use client'

// Shared state for the caregiver screens: one live payments list (polled), plus the
// approve/decline dialogs and the payment detail panel, which any screen can open.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PaymentStatus, RiskLevel, RuleHit } from '@/lib/domain'

export interface CaregiverPayment {
  id: string
  conversationId: string | null
  trustedPayeeId: string | null
  payeeName: string
  payeeEmail: string | null
  amountCents: number
  purpose: string | null
  status: PaymentStatus
  riskLevel: RiskLevel
  aiRiskLevel: RiskLevel | null
  reason: string | null
  aiSignals: string[]
  rulesTriggered: RuleHit[]
  paypalBatchId: string | null
  paypalItemId: string | null
  paypalStatus: string | null
  paypalError: string | null
  decidedAt: string | null
  sentAt: string | null
  createdAt: string
  updatedAt: string
}

interface CaregiverState {
  payments: CaregiverPayment[] | null
  loadError: boolean
  refresh: () => Promise<void>
  openDetail: (id: string | null) => void
  openApprove: (p: CaregiverPayment) => void
  openDecline: (p: CaregiverPayment) => void
  // dialog state, read by <CaregiverDialogs />
  detailId: string | null
  approving: CaregiverPayment | null
  declining: CaregiverPayment | null
  closeDialogs: () => void
}

const Ctx = createContext<CaregiverState | null>(null)

export function useCaregiver(): CaregiverState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCaregiver must be used inside <CaregiverProvider>')
  return ctx
}

const POLL_MS = 3000

export function CaregiverProvider({ children }: { children: ReactNode }) {
  const [payments, setPayments] = useState<CaregiverPayment[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [approving, setApproving] = useState<CaregiverPayment | null>(null)
  const [declining, setDeclining] = useState<CaregiverPayment | null>(null)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const res = await fetch('/api/caregiver/payments', { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      setPayments((await res.json()).payments)
      setLoadError(false)
    } catch {
      setLoadError(true)
    } finally {
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  const value = useMemo<CaregiverState>(
    () => ({
      payments,
      loadError,
      refresh,
      openDetail: setDetailId,
      openApprove: setApproving,
      openDecline: setDeclining,
      detailId,
      approving,
      declining,
      closeDialogs: () => {
        setApproving(null)
        setDeclining(null)
      },
    }),
    [payments, loadError, refresh, detailId, approving, declining],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
