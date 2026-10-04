import { Check, Clock3, Send } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const activity = [
  {
    title: 'Payment sent to Maria Lopez',
    text: '$85.00 · Today at 10:42 AM',
    icon: Send,
    color: 'bg-[#dcfce7] text-[#15803d]',
  },
  {
    title: 'Payment held for your review',
    text: '$450.00 to Kevin R. · Today at 9:18 AM',
    icon: Clock3,
    color: 'bg-[#fef3c7] text-[#b45309]',
  },
  {
    title: 'You approved a payment',
    text: '$120.00 to City Utilities · Yesterday',
    icon: Check,
    color: 'bg-[#dbeafe] text-[#1d4ed8]',
  },
]

export function ActivityPage() {
  return (
    <Card className="max-w-3xl border-[#e7e8e2] shadow-none">
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {activity.map((item) => (
          <div key={item.title} className="flex gap-4 py-4">
            <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', item.color)}>
              <item.icon />
            </div>
            <div>
              <p className="font-semibold">{item.title}</p>
              <p className="mt-1 text-sm text-[#7a887e]">{item.text}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
