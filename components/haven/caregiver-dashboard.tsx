import { Clock3, DollarSign, Phone, Send, ShieldCheck, X } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PaymentsTable } from './payments-table'
import { RiskBadge } from './risk-badge'
import { StatCard } from './stat-card'

export function CaregiverDashboard({ setPage }: { setPage: (p: string) => void }) {
  return (
    <div className="flex flex-col gap-6">
      <Card className="border-[#e7e8e2] shadow-none">
        <CardHeader className="flex-row items-center justify-between p-6 pb-4">
          <div>
            <CardTitle className="text-lg">Needs your attention</CardTitle>
            <CardDescription>Haven is holding this payment until you review it.</CardDescription>
          </div>
          <Badge className="bg-[#fff1d2] text-[#9a6a1a]">1 awaiting review</Badge>
        </CardHeader>
        <CardContent className="p-6 pt-0">
          <div className="flex flex-col gap-4 rounded-2xl border border-[#f1dfb8] bg-[#fffaf0] p-4">
            <div className="flex items-start gap-3">
              <Avatar className="size-11">
                <AvatarFallback className="bg-[#fed7aa] text-[#9a3412]">KR</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">
                  Kevin R. <span className="font-normal text-[#7f806f]">· $450.00</span>
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[#625d4e]">
                  Margaret said her grandson is in jail and needs bail money. She was told not to tell family. New
                  payee, amount over her limit.
                </p>
                <div className="mt-2">
                  <RiskBadge level="High" />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button className="bg-[#b91c1c] hover:bg-[#991b1b]">
                <X />
                Decline
              </Button>
              <Button variant="outline" className="border-[#1f6b4f] text-[#1f6b4f]">
                Approve
              </Button>
              <Button variant="outline" size="icon" aria-label="Call Margaret">
                <Phone />
              </Button>
              <span className="text-sm text-[#7f806f]">Held 12 minutes ago</span>
              <button className="text-sm font-medium text-[#1f6b4f] underline">Add to trusted payees</button>
              <button onClick={() => setPage('activity')} className="text-sm font-medium text-[#1f6b4f] underline">
                See conversation
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Payments today"
          value="4"
          note="1 more than yesterday"
          icon={Send}
          tone="bg-[#e5f4e8] text-[#23704a]"
        />
        <StatCard
          label="Amount held for review"
          value="$450"
          note="1 payment needs you"
          icon={Clock3}
          tone="bg-[#fff2d7] text-[#b7791f]"
        />
        <StatCard
          label="Flagged this week"
          value="2"
          note="1 needs your review"
          icon={ShieldCheck}
          tone="bg-[#f4e8ff] text-[#7e22ce]"
        />
        <StatCard
          label="Total sent this month"
          value="$1,285"
          note="Within Margaret's limits"
          icon={DollarSign}
          tone="bg-[#e3f1ff] text-[#2563a6]"
        />
      </div>
      <Card className="border-[#e7e8e2] shadow-none">
        <CardHeader>
          <CardTitle>Payments</CardTitle>
          <Input className="max-w-sm" placeholder="Search payments" />
        </CardHeader>
        <CardContent>
          <PaymentsTable />
        </CardContent>
      </Card>
    </div>
  )
}
