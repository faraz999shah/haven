import { Activity, LayoutDashboard, LockKeyhole, ShieldCheck, SlidersHorizontal, WalletCards } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export function Sidebar({ page, setPage }: { page: string; setPage: (page: string) => void }) {
  const items = [
    ['dashboard', 'Overview', LayoutDashboard],
    ['payments', 'All payments', WalletCards],
    ['activity', 'Activity', Activity],
    ['rules', 'Protection rules', SlidersHorizontal],
  ] as const
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-[#e7e8e2] bg-[#fbfcf8] p-5 lg:flex">
      <div className="flex items-center gap-3 px-2">
        <div className="flex size-9 items-center justify-center rounded-xl bg-[#1f6b4f] text-white">
          <ShieldCheck />
        </div>
        <span className="text-xl font-semibold tracking-tight text-[#1c2a22]">Haven</span>
      </div>
      <div className="mt-10 flex items-center gap-3 rounded-2xl bg-[#eef7f0] p-3">
        <Avatar className="size-10">
          <AvatarFallback className="bg-[#b8e2c2] text-[#1c5d3e]">SA</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-semibold text-[#1d2c23]">Managing: Margaret Adams</p>
          <p className="text-xs text-[#718078]">Sarah Adams · Caregiver</p>
        </div>
      </div>
      <nav className="mt-8 flex flex-1 flex-col gap-2">
        {items.map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setPage(id)}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium',
              page === id ? 'bg-[#1f6b4f] text-white shadow-sm' : 'text-[#607067] hover:bg-[#eef5ef]',
            )}
          >
            <Icon />
            {label}
          </button>
        ))}
      </nav>
      <div className="rounded-2xl border border-[#dcebe0] bg-[#f1f8f2] p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#286145]">
          <LockKeyhole />
          Haven protection
        </div>
        <p className="mt-2 text-xs leading-relaxed text-[#668170]">
          Every payment is checked by your rules and our safety assistant.
        </p>
      </div>
    </aside>
  )
}
