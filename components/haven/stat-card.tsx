import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function StatCard({
  label,
  value,
  note,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  note: string
  icon: any
  tone: string
}) {
  return (
    <Card className="border-[#e7e8e2] bg-white shadow-none">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-[#69716b]">{label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-[#18211c]">{value}</p>
            <p className="mt-2 text-xs text-[#7b827d]">{note}</p>
          </div>
          <div className={cn('flex size-10 items-center justify-center rounded-2xl', tone)}>
            <Icon />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
