'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export function RulesPage() {
  const [single, setSingle] = useState(200)
  const [daily, setDaily] = useState(300)
  const [people, setPeople] = useState([
    { name: 'Maria Adams', detail: 'Granddaughter', contact: 'maria.adams@example.com' },
    { name: "Joe's Plumbing", detail: 'Plumber', contact: 'joe@joesplumbing.com' },
    { name: 'Linda Park', detail: 'Neighbor', contact: '(555) 014-8820' },
  ])
  const [dialog, setDialog] = useState(false)
  const [saved, setSaved] = useState(false)
  const adjust = (which: 'single' | 'daily', amount: number) => {
    which === 'single' ? setSingle((v) => Math.max(0, v + amount)) : setDaily((v) => Math.max(0, v + amount))
    setSaved(false)
  }
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
          {people.map((person) => (
            <div
              key={person.name}
              className="flex flex-col gap-3 rounded-2xl border border-[#e7eee7] p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold">
                  {person.name} <span className="font-normal text-[#7a887e]">· {person.detail}</span>
                </p>
                <p className="mt-1 text-sm text-[#7a887e]">{person.contact}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPeople((current) => current.filter((item) => item.name !== person.name))
                    setSaved(false)
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
            onClick={() => setDialog(true)}
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
          {[
            ['single', 'Max single payment without approval', single, 'Payments above this amount wait for you.'],
            ['daily', 'Daily spending limit', daily, 'Keeps total daily spending predictable.'],
          ].map(([which, label, value, text]) => (
            <div key={which as string} className="rounded-2xl bg-[#f5f9f5] p-4">
              <p className="font-semibold">{label as string}</p>
              <p className="mt-1 text-sm text-[#718078]">{text as string}</p>
              <div className="mt-4 flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => adjust(which as 'single' | 'daily', -25)}
                  aria-label={`Decrease ${label}`}
                >
                  −
                </Button>
                <div className="min-w-24 text-center text-2xl font-semibold">${value as number}</div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => adjust(which as 'single' | 'daily', 25)}
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
                <input type="radio" name="payees" defaultChecked />
                Always ask me
              </label>
              <label className="flex items-center gap-3">
                <input type="radio" name="payees" />
                Ask me only if over <Input className="h-9 w-24" defaultValue="200" aria-label="New payee amount" />
              </label>
            </div>
          </fieldset>
          <div>
            <p className="font-semibold">Rapid payments</p>
            <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[#5f7066]">
              Ask me if Margaret sends more than{' '}
              <Input className="h-9 w-16" defaultValue="3" aria-label="Rapid payment count" /> payments within{' '}
              <Input className="h-9 w-16" defaultValue="1" aria-label="Rapid payment hours" /> hour.
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
        <span className={cn('text-sm font-medium', saved ? 'text-[#286145]' : 'text-[#9a6a1a')}>
          {saved ? "Margaret's rules are updated" : 'Unsaved changes'}
        </span>
        <Button className="bg-[#1f6b4f] hover:bg-[#18573f]" onClick={() => setSaved(true)}>
          {saved ? 'Saved' : 'Save changes'}
        </Button>
      </div>
      {dialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Add trusted person"
        >
          <Card className="w-full max-w-md shadow-xl">
            <CardHeader>
              <CardTitle>Add trusted person</CardTitle>
              <CardDescription>People Margaret can pay without extra checks.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <label className="text-sm font-medium">
                Name
                <Input className="mt-2" id="trusted-name" />
              </label>
              <label className="text-sm font-medium">
                PayPal email or phone
                <Input className="mt-2" id="trusted-contact" />
              </label>
              <label className="text-sm font-medium">
                Relationship or purpose
                <Input className="mt-2" id="trusted-detail" />
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setDialog(false)}>
                  Cancel
                </Button>
                <Button
                  className="bg-[#1f6b4f]"
                  onClick={() => {
                    const name =
                      (document.getElementById('trusted-name') as HTMLInputElement).value || 'New trusted person'
                    const contact =
                      (document.getElementById('trusted-contact') as HTMLInputElement).value || 'Contact added'
                    const detail =
                      (document.getElementById('trusted-detail') as HTMLInputElement).value || 'Trusted person'
                    setPeople((current) => [...current, { name, contact, detail }])
                    setDialog(false)
                    setSaved(false)
                  }}
                >
                  Add person
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
