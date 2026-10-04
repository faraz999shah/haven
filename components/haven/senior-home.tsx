'use client'

import { useState } from 'react'
import { Mic } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Role } from './types'

export function SeniorHome({ setRole }: { setRole: (role: Role) => void }) {
  const [listening, setListening] = useState(false)
  const [typing, setTyping] = useState(false)
  return (
    <div className="relative flex min-h-[calc(100vh-150px)] flex-col items-center justify-center pb-28">
      <div className="w-full max-w-2xl">
        <Card className="border-[#dfe9df] bg-[#f7fbf6] shadow-none">
          <CardContent className="flex flex-col items-center p-6 sm:p-10">
            <button
              onClick={() => setListening(!listening)}
              aria-label="Tap and tell Haven who to pay"
              className={cn(
                'relative flex size-44 items-center justify-center rounded-full bg-[#1f6b4f] text-white shadow-[0_12px_30px_rgba(31,107,79,0.25)] transition-transform hover:scale-[1.02]',
                listening && 'animate-pulse ring-8 ring-[#cce7d3]',
              )}
            >
              <Mic className="size-16" />
            </button>
            <p className="mt-8 text-center text-2xl font-semibold text-[#244332]">
              {listening ? "I'm listening..." : 'Tap and tell me who to pay'}
            </p>
            <p className="mt-2 text-lg font-medium text-[#3d5948]">Try saying &quot;Pay Maria $85&quot;</p>
            <button
              onClick={() => setTyping(!typing)}
              className="mt-5 text-lg font-semibold text-[#1f6b4f] underline underline-offset-4"
            >
              Type instead.
            </button>
            {typing && (
              <div className="mt-5 flex w-full gap-3">
                <Input className="h-14 bg-white text-lg" placeholder="Who would you like to pay?" />
                <Button className="h-14 bg-[#1f6b4f] px-6 text-lg">Send</Button>
              </div>
            )}
            <div className="mt-8 w-full rounded-2xl border border-[#cfe4d2] bg-white p-6">
              <p className="text-base text-[#6b7c70]">You said: I&apos;d like to send Maria $85 for the groceries.</p>
              <p className="mt-3 text-2xl font-semibold leading-snug text-[#1d3828]">
                Send $85 to Maria for groceries?
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Button className="h-14 bg-[#1f6b4f] text-lg hover:bg-[#18573f]">Yes, send it</Button>
                <Button variant="outline" className="h-14 border-[#1f6b4f] text-lg text-[#1f6b4f]">
                  No, cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="fixed inset-x-0 bottom-0 flex justify-center gap-3 bg-[#f4f7f2] px-5 pb-5 pt-3">
        <Button variant="outline" className="h-14 flex-1 max-w-xs text-lg" onClick={() => {}}>
          My payments
        </Button>
        <Button variant="outline" className="h-14 flex-1 max-w-xs text-lg" onClick={() => {}}>
          My people
        </Button>
      </div>
      <button onClick={() => setRole('caregiver')} className="fixed bottom-3 right-3 text-xs text-[#718078] underline">
        Demo: switch view
      </button>
    </div>
  )
}
