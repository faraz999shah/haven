'use client'

import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import type { NewPayeeMode } from '@/lib/domain'
import { cn } from '@/lib/utils'

interface Person {
  key: string // stable React key, also for unsaved people
  id: string | null
  name: string
  relationship: string
  paypalEmail: string
  phone: string
  aliases: string[]
}

interface Settings {
  maxSinglePaymentCents: number
  dailyLimitCents: number
  newPayeeMode: NewPayeeMode
  newPayeeThresholdCents: number
  rapidMaxCount: number
  rapidWindowMinutes: number
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function toPeople(payees: Omit<Person, 'key'>[]): Person[] {
  return payees.map((p) => ({
    key: p.id!,
    id: p.id,
    name: p.name,
    relationship: p.relationship ?? '',
    paypalEmail: p.paypalEmail ?? '',
    phone: p.phone ?? '',
    aliases: p.aliases ?? [],
  }))
}

export function RulesPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [editing, setEditing] = useState<Person | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  const apply = (data: { settings: Settings; payees: Omit<Person, 'key'>[] }) => {
    setSettings(data.settings)
    setPeople(toPeople(data.payees))
    setDirty(false)
  }

  useEffect(() => {
    fetch('/api/caregiver/rules', { cache: 'no-store' })
      .then((r) => r.json())
      .then(apply)
      .catch(() => setStatus({ ok: false, text: "Couldn't load Margaret's rules. Please refresh." }))
  }, [])

  const change = (patch: Partial<Settings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s))
    setDirty(true)
    setStatus(null)
  }
  const adjust = (which: 'maxSinglePaymentCents' | 'dailyLimitCents', deltaDollars: number) =>
    settings && change({ [which]: Math.max(0, settings[which] + deltaDollars * 100) })

  const save = async () => {
    if (!settings) return
    setSaving(true)
    const res = await fetch('/api/caregiver/rules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings,
        payees: people.map(({ key: _key, ...p }) => ({ ...p, phone: p.phone || null })),
      }),
    }).catch(() => null)
    setSaving(false)
    if (!res?.ok) {
      const msg = (await res?.json().catch(() => null))?.error
      return setStatus({ ok: false, text: msg ? `Couldn't save: ${msg}` : "Couldn't save. Please try again." })
    }
    apply(await res.json())
    setStatus({ ok: true, text: "Margaret's rules are updated" })
  }

  if (!settings) {
    return (
      <div className="mx-auto flex max-w-4xl items-center gap-3 text-[#6c7d72]">
        {status ? (
          status.text
        ) : (
          <>
            <Spinner /> Loading rules...
          </>
        )}
      </div>
    )
  }

  const dollars = (cents: number) => Math.round(cents / 100)

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-[#789081]">Protection rules</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#1f3026]">Margaret&apos;s protection rules</h2>
        <p className="mt-2 text-base text-[#6c7d72]">
          These rules decide which payments go through on their own and which wait for you.
        </p>
      </div>
      <Card className="border-[#e7e8e2] shadow-none">
        <CardHeader>
          <CardTitle>Trusted people</CardTitle>
          <CardDescription>
            Payments to trusted people go through without extra checks, as long as they&apos;re within the limits below.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {people.length === 0 && <p className="text-sm text-[#7a887e]">No trusted people yet.</p>}
          {people.map((person) => (
            <div
              key={person.key}
              className="flex flex-col gap-3 rounded-2xl border border-[#e7eee7] p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-semibold">
                  {person.name}
                  {person.relationship && <span className="font-normal text-[#7a887e]"> · {person.relationship}</span>}
                </p>
                <p className="mt-1 break-all text-sm text-[#7a887e]">
                  {[person.paypalEmail || 'No PayPal email', person.phone].filter(Boolean).join(' · ')}
                </p>
                {person.aliases.length > 0 && (
                  <p className="mt-1 text-xs text-[#93a097]">Margaret may say: {person.aliases.join(', ')}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(person)}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPeople((current) => current.filter((item) => item.key !== person.key))
                    setDirty(true)
                    setStatus(null)
                  }}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            className="mt-2 w-fit border-[#1f6b4f] text-[#1f6b4f]"
            onClick={() =>
              setEditing({
                key: crypto.randomUUID(),
                id: null,
                name: '',
                relationship: '',
                paypalEmail: '',
                phone: '',
                aliases: [],
              })
            }
          >
            <Plus data-icon="inline-start" />
            Add trusted person
          </Button>
        </CardContent>
      </Card>
      <Card className="border-[#e7e8e2] shadow-none">
        <CardHeader>
          <CardTitle>Spending limits</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {(
            [
              [
                'maxSinglePaymentCents',
                'Max single payment without approval',
                'Payments above this amount wait for you.',
              ],
              ['dailyLimitCents', 'Daily spending limit', 'Keeps total daily spending predictable.'],
            ] as const
          ).map(([which, label, text]) => (
            <div key={which} className="rounded-2xl bg-[#f5f9f5] p-4">
              <p className="font-semibold">{label}</p>
              <p className="mt-1 text-sm text-[#718078]">{text}</p>
              <div className="mt-4 flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => adjust(which, -25)}
                  aria-label={`Decrease ${label}`}
                >
                  −
                </Button>
                <div className="min-w-24 text-center text-2xl font-semibold">${dollars(settings[which])}</div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => adjust(which, 25)}
                  aria-label={`Increase ${label}`}
                >
                  +
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="border-[#e7e8e2] shadow-none">
        <CardHeader>
          <CardTitle>Extra checks</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <fieldset>
            <legend className="font-semibold">New payees</legend>
            <div className="mt-3 flex flex-col gap-3 text-sm">
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="payees"
                  checked={settings.newPayeeMode === 'always'}
                  onChange={() => change({ newPayeeMode: 'always' })}
                />
                Always ask me
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="payees"
                  checked={settings.newPayeeMode === 'over_amount'}
                  onChange={() => change({ newPayeeMode: 'over_amount' })}
                />
                Ask me only if over $
                <Input
                  className="h-9 w-24"
                  type="number"
                  min={0}
                  value={dollars(settings.newPayeeThresholdCents)}
                  onChange={(e) =>
                    change({
                      newPayeeThresholdCents: Math.max(0, Math.round(Number(e.target.value) || 0)) * 100,
                      newPayeeMode: 'over_amount',
                    })
                  }
                  aria-label="New payee amount"
                />
              </label>
            </div>
          </fieldset>
          <div>
            <p className="font-semibold">Rapid payments</p>
            <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[#5f7066]">
              Ask me if Margaret sends more than{' '}
              <Input
                className="h-9 w-16"
                type="number"
                min={1}
                value={settings.rapidMaxCount}
                onChange={(e) => change({ rapidMaxCount: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                aria-label="Rapid payment count"
              />{' '}
              payments within{' '}
              <Input
                className="h-9 w-16"
                type="number"
                min={1}
                value={Math.max(1, Math.round(settings.rapidWindowMinutes / 60))}
                onChange={(e) =>
                  change({ rapidWindowMinutes: Math.max(1, Math.round(Number(e.target.value) || 1)) * 60 })
                }
                aria-label="Rapid payment hours"
              />{' '}
              {Math.round(settings.rapidWindowMinutes / 60) === 1 ? 'hour' : 'hours'}.
            </label>
          </div>
        </CardContent>
      </Card>
      <Card className="border-[#cfe4d2] bg-[#f1f8f2] shadow-none">
        <CardHeader>
          <CardTitle>How Haven&apos;s AI helps</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="leading-relaxed text-[#466352]">
            Haven also listens for signs of scams, like urgency, secrecy, or someone pretending to be family, the bank,
            or the government. It can always ask for your approval, even for payments within these limits. It can never
            skip these rules.
          </p>
        </CardContent>
      </Card>
      <div className="sticky bottom-4 flex items-center justify-between rounded-2xl border border-[#dce8dd] bg-white/95 p-4 shadow-lg backdrop-blur">
        <span
          className={cn(
            'text-sm font-medium',
            status ? (status.ok ? 'text-[#286145]' : 'text-[#b91c1c]') : dirty ? 'text-[#9a6a1a]' : 'text-[#6c7d72]',
          )}
        >
          {status?.text ?? (dirty ? 'Unsaved changes' : 'All changes saved')}
        </span>
        <Button className="bg-[#1f6b4f] hover:bg-[#18573f]" onClick={save} disabled={!dirty || saving}>
          {saving && <Spinner />} {dirty ? 'Save changes' : 'Saved'}
        </Button>
      </div>
      <PersonDialog
        person={editing}
        onClose={() => setEditing(null)}
        onSave={(p) => {
          setPeople((current) =>
            current.some((c) => c.key === p.key) ? current.map((c) => (c.key === p.key ? p : c)) : [...current, p],
          )
          setEditing(null)
          setDirty(true)
          setStatus(null)
        }}
      />
    </div>
  )
}

function PersonDialog({
  person,
  onClose,
  onSave,
}: {
  person: Person | null
  onClose: () => void
  onSave: (p: Person) => void
}) {
  const [form, setForm] = useState<Person | null>(person)
  const [aliasText, setAliasText] = useState('')
  useEffect(() => {
    setForm(person)
    setAliasText(person?.aliases.join(', ') ?? '')
  }, [person])
  if (!form) return null

  const emailOk = !form.paypalEmail || EMAIL.test(form.paypalEmail.trim())
  const field = (key: 'name' | 'relationship' | 'paypalEmail' | 'phone') => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value }),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{form.id ? `Edit ${person?.name}` : 'Add trusted person'}</DialogTitle>
          <DialogDescription>People Margaret can pay without extra checks.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <label className="text-sm font-medium">
            Name
            <Input className="mt-2" {...field('name')} />
          </label>
          <label className="text-sm font-medium">
            Relationship or purpose
            <Input className="mt-2" placeholder="e.g. Granddaughter, Plumber" {...field('relationship')} />
          </label>
          <label className="text-sm font-medium">
            PayPal email
            <Input className="mt-2" type="email" {...field('paypalEmail')} />
            {!emailOk && <span className="mt-1 block text-xs text-[#b91c1c]">That email doesn&apos;t look right.</span>}
          </label>
          <label className="text-sm font-medium">
            Phone (optional)
            <Input className="mt-2" {...field('phone')} />
          </label>
          <label className="text-sm font-medium">
            Other names Margaret uses (optional)
            <Input
              className="mt-2"
              placeholder="e.g. Maria, my granddaughter"
              value={aliasText}
              onChange={(e) => setAliasText(e.target.value)}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-[#1f6b4f] hover:bg-[#18573f]"
            disabled={!form.name.trim() || !emailOk}
            onClick={() =>
              onSave({
                ...form,
                name: form.name.trim(),
                relationship: form.relationship.trim(),
                paypalEmail: form.paypalEmail.trim(),
                phone: form.phone.trim(),
                aliases: aliasText
                  .split(',')
                  .map((a) => a.trim())
                  .filter(Boolean),
              })
            }
          >
            {form.id ? 'Done' : 'Add person'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
