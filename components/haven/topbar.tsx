import { Bell, Menu } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Role } from './types'

export function Topbar({ role, setRole }: { role: Role; setRole: (role: Role) => void }) {
  return (
    <header className="flex items-center justify-between border-b border-[#e7e8e2] bg-white px-5 py-4 sm:px-8">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="ghost" className="lg:hidden">
          <Menu />
        </Button>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#789081]">
            {role === 'senior' ? 'My Haven' : 'Caregiver portal'}
          </p>
          <h1 className="text-lg font-semibold text-[#1b2820]">
            {role === 'senior' ? 'Good morning, Margaret' : "Margaret's account"}
          </h1>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div
          className="flex items-center rounded-xl border border-[#d8e5da] bg-[#f4f8f4] p-1"
          aria-label="Switch between Margaret and caregiver views"
        >
          <Button
            type="button"
            size="sm"
            variant={role === 'senior' ? 'default' : 'ghost'}
            onClick={() => setRole('senior')}
            className={cn(
              'h-8 rounded-lg px-3 text-xs',
              role === 'senior' ? 'bg-[#1f6b4f] text-white hover:bg-[#18573f]' : 'text-[#607067]',
            )}
          >
            Margaret&apos;s view
          </Button>
          <Button
            type="button"
            size="sm"
            variant={role === 'caregiver' ? 'default' : 'ghost'}
            onClick={() => setRole('caregiver')}
            className={cn(
              'h-8 rounded-lg px-3 text-xs',
              role === 'caregiver' ? 'bg-[#1f6b4f] text-white hover:bg-[#18573f]' : 'text-[#607067]',
            )}
          >
            Caregiver view
          </Button>
        </div>
        {role === 'caregiver' ? (
          <>
            <Button size="icon" variant="ghost">
              <Bell />
            </Button>
            <Avatar className="size-9">
              <AvatarFallback className="bg-[#dcefe0] text-sm font-semibold text-[#286145]">SA</AvatarFallback>
            </Avatar>
          </>
        ) : null}
      </div>
    </header>
  )
}
